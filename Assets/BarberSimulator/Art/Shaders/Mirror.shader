// Planar mirror surface for URP. Samples the reflection texture rendered by PlanarMirror in screen space and
// layers a subtle dirt/smudge texture on top. Falls back to a dark tint when no reflection is available.
Shader "BarberSimulator/Mirror"
{
    Properties
    {
        _ReflectionTex ("Reflection", 2D) = "black" {}
        _Tint ("Tint", Color) = (0.86, 0.9, 0.9, 1)
        _DirtTex ("Dirt (RGBA)", 2D) = "black" {}
        _DirtStrength ("Dirt Strength", Range(0, 1)) = 0.55
        _Fallback ("Fallback Colour", Color) = (0.16, 0.17, 0.17, 1)
        _HasReflection ("Has Reflection", Float) = 0
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }

        Pass
        {
            Name "MirrorUnlit"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            TEXTURE2D(_ReflectionTex); SAMPLER(sampler_ReflectionTex);
            TEXTURE2D(_DirtTex); SAMPLER(sampler_DirtTex);

            CBUFFER_START(UnityPerMaterial)
                float4 _Tint;
                float4 _DirtTex_ST;
                float _DirtStrength;
                float4 _Fallback;
                float _HasReflection;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float4 screenPos : TEXCOORD0;
                float2 uv : TEXCOORD1;
                float3 positionWS : TEXCOORD2;
                float3 normalWS : TEXCOORD3;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.screenPos = ComputeScreenPos(output.positionCS);
                output.uv = TRANSFORM_TEX(input.uv, _DirtTex);
                output.positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float2 screenUV = input.screenPos.xy / input.screenPos.w;
                half3 reflection = SAMPLE_TEXTURE2D(_ReflectionTex, sampler_ReflectionTex, screenUV).rgb * _Tint.rgb;
                // Without the live reflection, sample the environment (reflection probe) along the mirrored view ray.
                float3 viewDir = normalize(GetWorldSpaceViewDir(input.positionWS));
                float3 reflected = reflect(-viewDir, normalize(input.normalWS));
                half4 probe = SAMPLE_TEXTURECUBE_LOD(unity_SpecCube0, samplerunity_SpecCube0, reflected, 0);
                half3 probeColor = DecodeHDREnvironment(probe, unity_SpecCube0_HDR) * _Tint.rgb;
                half3 fallback = lerp(_Fallback.rgb, probeColor, 0.85);
                half3 color = lerp(fallback, reflection, saturate(_HasReflection));
                half4 dirt = SAMPLE_TEXTURE2D(_DirtTex, sampler_DirtTex, input.uv);
                color = lerp(color, dirt.rgb, dirt.a * _DirtStrength);
                return half4(color, 1);
            }
            ENDHLSL
        }
    }
}
