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
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float4 screenPos : TEXCOORD0;
                float2 uv : TEXCOORD1;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.screenPos = ComputeScreenPos(output.positionCS);
                output.uv = TRANSFORM_TEX(input.uv, _DirtTex);
                return output;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float2 screenUV = input.screenPos.xy / input.screenPos.w;
                half3 reflection = SAMPLE_TEXTURE2D(_ReflectionTex, sampler_ReflectionTex, screenUV).rgb * _Tint.rgb;
                half3 color = lerp(_Fallback.rgb, reflection, saturate(_HasReflection));
                half4 dirt = SAMPLE_TEXTURE2D(_DirtTex, sampler_DirtTex, input.uv);
                color = lerp(color, dirt.rgb, dirt.a * _DirtStrength);
                return half4(color, 1);
            }
            ENDHLSL
        }
    }
}
