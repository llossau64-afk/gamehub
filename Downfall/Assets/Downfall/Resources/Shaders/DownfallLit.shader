// Simple lit shader for the world (URP): base map x colour x optional vertex colour (the MatDefs
// VC() flag: terrain fallback, rock, foliage, standStruct), plus the assets.js patchFoliage effects:
// wind sway (global _DfTime/_DfWind), leaf flutter, world-space snow (_DfSnow), grass darkening
// at the root and the screen-door fade of cards right in front of the camera. GPU instancing.
// _Sway  = (sway x, sway z, leaf flutter, grass mode)   _SnowK = (smooth min, smooth max, amount, card fade)
Shader "Downfall/Lit"
{
    Properties
    {
        _BaseMap ("Base Map", 2D) = "white" {}
        _BaseColor ("Color", Color) = (1, 1, 1, 1)
        _Cutoff ("Alpha Cutoff", Range(0, 1)) = 0.5
        _UseVC ("Vertex Colours", Float) = 0
        _Sway ("Sway", Vector) = (0, 0, 0, 0)
        _SnowK ("Snow", Vector) = (0.25, 0.75, 0, 0)
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 2
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" "RenderPipeline" = "UniversalPipeline" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

        TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            half4 _BaseColor;
            half _Cutoff, _UseVC, _Cull;
            float4 _Sway, _SnowK;
        CBUFFER_END
        float _DfTime, _DfWind, _DfSnow;

        struct A
        {
            float4 pos : POSITION; float3 nrm : NORMAL; float2 uv : TEXCOORD0; half4 col : COLOR;
            UNITY_VERTEX_INPUT_INSTANCE_ID
        };

        // wind sway in object space (the JS adds it before the instance matrix)
        void Sway(inout float3 p, inout float3 n)
        {
            float3 ip = UNITY_MATRIX_M._m03_m13_m23;
            float ph = dot(ip.xz, float2(0.131, 0.173));
            float hgt = max(0.0, p.y);
            float sw = sin(_DfTime * 1.25 + ph) * 0.6 + sin(_DfTime * 2.9 + ph * 1.7) * 0.25;
            p.x += sw * _DfWind * hgt * hgt * _Sway.x;
            p.z += sw * _DfWind * hgt * hgt * _Sway.y;
            p += n * sin(_DfTime * 5.0 + p.x * 3.1 + p.z * 2.3 + ph) * _Sway.z * (0.4 + _DfWind);
            if (_Sway.w > 0.5) n = float3(0, 1, 0);
        }
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            Cull [_Cull]
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile_fog
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_local _ _ALPHATEST_ON

            struct V
            {
                float4 pos : SV_POSITION; float2 uv : TEXCOORD0; half4 col : COLOR; float3 wp : TEXCOORD1; half3 wn : TEXCOORD2;
                float hgt : TEXCOORD3; float fog : TEXCOORD4; float camD : TEXCOORD5;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            V vert(A i)
            {
                V o;
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_TRANSFER_INSTANCE_ID(i, o);
                float3 p = i.pos.xyz, n = i.nrm;
                o.hgt = p.y;
                Sway(p, n);
                o.wp = TransformObjectToWorld(p);
                o.wn = TransformObjectToWorldNormal(n);
                o.pos = TransformWorldToHClip(o.wp);
                o.uv = TRANSFORM_TEX(i.uv, _BaseMap);
                o.col = i.col;
                o.fog = ComputeFogFactor(o.pos.z);
                o.camD = -TransformWorldToView(o.wp).z;
                return o;
            }

            half4 frag(V i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                half4 c = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv) * _BaseColor;
                if (_UseVC > 0.5) c.rgb *= i.col.rgb;
                #ifdef _ALPHATEST_ON
                    if (_SnowK.w > 0.5)
                    {
                        float ign = frac(52.9829189 * frac(dot(i.pos.xy, float2(0.06711056, 0.00583715))));
                        if (ign > smoothstep(0.9, 3.4, i.camD)) discard;
                    }
                    clip(c.a - _Cutoff);
                #endif
                half3 n = normalize(i.wn);
                if (_Sway.w > 0.5) c.rgb *= lerp(0.45, 0.95, smoothstep(0.0, 0.45, i.hgt));
                half snowK = smoothstep(_SnowK.x, _SnowK.y, n.y) * _DfSnow * _SnowK.z;
                c.rgb = lerp(c.rgb, half3(0.9, 0.93, 0.97), snowK * 0.9);
                Light L = GetMainLight(TransformWorldToShadowCoord(i.wp));
                half ndl = saturate(dot(n, L.direction));
                half3 col = c.rgb * (L.color * (ndl * L.shadowAttenuation) + SampleSH(n));
                col = MixFog(col, i.fog);
                return half4(col, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0
            Cull [_Cull]
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile_local _ _ALPHATEST_ON
            float3 _LightDirection;
            struct V { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            V vert(A i)
            {
                V o;
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_TRANSFER_INSTANCE_ID(i, o);
                float3 p = i.pos.xyz, n = i.nrm;
                Sway(p, n);
                float3 wp = TransformObjectToWorld(p);
                float3 wn = TransformObjectToWorldNormal(n);
                float4 cs = TransformWorldToHClip(ApplyShadowBias(wp, wn, _LightDirection));
                #if UNITY_REVERSED_Z
                    cs.z = min(cs.z, UNITY_NEAR_CLIP_VALUE);
                #else
                    cs.z = max(cs.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                o.pos = cs;
                o.uv = TRANSFORM_TEX(i.uv, _BaseMap);
                return o;
            }
            half4 frag(V i) : SV_Target
            {
                #ifdef _ALPHATEST_ON
                    clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a * _BaseColor.a - _Cutoff);
                #endif
                return 0;
            }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On ColorMask R
            Cull [_Cull]
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile_local _ _ALPHATEST_ON
            struct V { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            V vert(A i)
            {
                V o;
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_TRANSFER_INSTANCE_ID(i, o);
                float3 p = i.pos.xyz, n = i.nrm;
                Sway(p, n);
                o.pos = TransformObjectToHClip(p);
                o.uv = TRANSFORM_TEX(i.uv, _BaseMap);
                return o;
            }
            half4 frag(V i) : SV_Target
            {
                #ifdef _ALPHATEST_ON
                    clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a * _BaseColor.a - _Cutoff);
                #endif
                return 0;
            }
            ENDHLSL
        }
    }
    FallBack "Universal Render Pipeline/Lit"
}
