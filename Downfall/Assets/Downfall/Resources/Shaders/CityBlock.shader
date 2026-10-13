// City blocks of the street circuits (circuit.js blockParts): a unit box scaled per instance,
// windows, floor bands and dark shop fronts from the world position, lit windows emissive.
// The palette tint is hashed from the instance position. GPU instancing, URP forward.
Shader "Downfall/CityBlock"
{
    Properties { }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" "RenderPipeline" = "UniversalPipeline" }
        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
        CBUFFER_START(UnityPerMaterial)
            float _Unused;
        CBUFFER_END
        struct A { float4 pos : POSITION; float3 nrm : NORMAL; UNITY_VERTEX_INPUT_INSTANCE_ID };
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile_fog
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            struct V { float4 pos : SV_POSITION; float3 wp : TEXCOORD0; float3 wn : TEXCOORD1; float ly : TEXCOORD2; float tint : TEXCOORD3; float fog : TEXCOORD4; };
            float h21(float2 p) { return frac(sin(dot(p, float2(41.3, 289.1))) * 43758.5); }
            V vert(A i)
            {
                V o;
                UNITY_SETUP_INSTANCE_ID(i);
                o.wp = TransformObjectToWorld(i.pos.xyz);
                o.wn = TransformObjectToWorldNormal(i.nrm);
                float3 base = UNITY_MATRIX_M._m03_m13_m23;
                o.ly = o.wp.y - base.y;
                o.tint = frac(sin(dot(float2(-base.x, base.z), float2(12.9898, 78.233))) * 43758.5);
                o.pos = TransformWorldToHClip(o.wp);
                o.fog = ComputeFogFactor(o.pos.z);
                return o;
            }
            half4 frag(V i) : SV_Target
            {
                float3 wn = normalize(i.wn);
                float3 wp = float3(-i.wp.x, i.wp.y, i.wp.z);
                float side = abs(wn.y) < 0.5 ? 1.0 : 0.0;
                float2 f = float2(abs(wn.x) > 0.5 ? wp.z : wp.x, i.ly);
                float2 cell = floor(f / float2(1.9, 3.2));
                float2 lf = frac(f / float2(1.9, 3.2));
                float win = step(0.28, lf.x) * step(lf.x, 0.72) * step(0.38, lf.y) * step(lf.y, 0.82) * side * step(3.3, i.ly);
                float lit = step(0.55, h21(cell + floor(wp.xz * 0.05)));
                float t = i.tint;
                float3 c = t < 0.25 ? float3(0.78, 0.74, 0.66) : t < 0.5 ? float3(0.62, 0.6, 0.58) : t < 0.75 ? float3(0.74, 0.62, 0.52) : float3(0.85, 0.84, 0.8);
                c *= 1.0 - 0.12 * step(0.94, frac(i.ly / 3.2)) * side;
                c = lerp(c, float3(0.13, 0.16, 0.2), win);
                c *= 1.0 - 0.45 * side * (1.0 - step(3.3, i.ly));
                Light L = GetMainLight(TransformWorldToShadowCoord(i.wp));
                half ndl = saturate(dot(wn, L.direction));
                half3 col = c * (L.color * (ndl * L.shadowAttenuation) + SampleSH(wn)) + win * lit * float3(1.0, 0.82, 0.55) * 0.55;
                return half4(MixFog(col, i.fog), 1);
            }
            ENDHLSL
        }
        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On ColorMask 0
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            float3 _LightDirection;
            float4 vert(A i) : SV_POSITION
            {
                UNITY_SETUP_INSTANCE_ID(i);
                float3 wp = TransformObjectToWorld(i.pos.xyz);
                float4 cs = TransformWorldToHClip(ApplyShadowBias(wp, TransformObjectToWorldNormal(i.nrm), _LightDirection));
                #if UNITY_REVERSED_Z
                    cs.z = min(cs.z, UNITY_NEAR_CLIP_VALUE);
                #else
                    cs.z = max(cs.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                return cs;
            }
            half4 frag() : SV_Target { return 0; }
            ENDHLSL
        }
        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On ColorMask R
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            float4 vert(A i) : SV_POSITION { UNITY_SETUP_INSTANCE_ID(i); return TransformObjectToHClip(i.pos.xyz); }
            half4 frag() : SV_Target { return 0; }
            ENDHLSL
        }
    }
    FallBack "Universal Render Pipeline/Lit"
}
