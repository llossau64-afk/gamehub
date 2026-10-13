// Seven-layer terrain (port of assets.js makeTerrainMaterial): grass, forest floor, dirt, gravel,
// rock (triplanar with _TRIPLANAR), snow, sand. Weights come from two vertex attributes
// (uv1 = splatA, uv2 = splatB), the vertex colour tints; steep faces turn to rock whatever the
// painted weights say, and a cheap bump comes from the blended albedo luminance. URP forward.
Shader "Downfall/Terrain"
{
    Properties
    {
        _T_grass ("Grass", 2D) = "white" {}
        _T_forest ("Forest", 2D) = "white" {}
        _T_dirt ("Dirt", 2D) = "white" {}
        _T_gravel ("Gravel", 2D) = "white" {}
        _T_rock ("Rock", 2D) = "white" {}
        _T_snow ("Snow", 2D) = "white" {}
        _T_sand ("Sand", 2D) = "white" {}
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" "RenderPipeline" = "UniversalPipeline" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
        CBUFFER_START(UnityPerMaterial)
            float4 _T_grass_ST;
        CBUFFER_END
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_local _ _TRIPLANAR

            TEXTURE2D(_T_grass); SAMPLER(sampler_T_grass);
            TEXTURE2D(_T_forest); TEXTURE2D(_T_dirt); TEXTURE2D(_T_gravel); TEXTURE2D(_T_rock); TEXTURE2D(_T_snow); TEXTURE2D(_T_sand);
            #define TEX(t, uv) SAMPLE_TEXTURE2D(t, sampler_T_grass, uv).rgb

            struct A { float4 pos : POSITION; float3 nrm : NORMAL; half4 col : COLOR; float4 sa : TEXCOORD1; float4 sb : TEXCOORD2; };
            struct V { float4 pos : SV_POSITION; half4 col : COLOR; float4 sa : TEXCOORD0; float4 sb : TEXCOORD1; float3 wp : TEXCOORD2; float3 wn : TEXCOORD3; float fog : TEXCOORD4; };

            V vert(A i)
            {
                V o;
                o.wp = TransformObjectToWorld(i.pos.xyz);
                o.wn = TransformObjectToWorldNormal(i.nrm);
                o.pos = TransformWorldToHClip(o.wp);
                o.col = i.col; o.sa = i.sa; o.sb = i.sb;
                o.fog = ComputeFogFactor(o.pos.z);
                return o;
            }

            float3 TwoScale(TEXTURE2D_PARAM(t, s), float2 uv) { return lerp(SAMPLE_TEXTURE2D(t, s, uv).rgb, SAMPLE_TEXTURE2D(t, s, uv * 0.23 + 0.37).rgb, 0.35); }
            float3 Tri(float3 wp, float3 bw, float sc, float off)
            {
                return TEX(_T_rock, wp.zy * sc + off) * bw.x + TEX(_T_rock, wp.xz * sc + off) * bw.y + TEX(_T_rock, wp.xy * sc + off) * bw.z;
            }

            half4 frag(V i) : SV_Target
            {
                // the game's world is mirrored in x: sample with game-space coordinates
                float3 wp = float3(-i.wp.x, i.wp.y, i.wp.z);
                float3 wn0 = normalize(i.wn);
                float3 wn = float3(-wn0.x, wn0.y, wn0.z);
                float2 uv = wp.xz * 0.16;
                float3 c = 0; float wsum = 0.0001;
                if (i.sa.x > 0.01) { c += TwoScale(TEXTURE2D_ARGS(_T_grass, sampler_T_grass), uv) * i.sa.x; wsum += i.sa.x; }
                if (i.sa.y > 0.01) { c += TwoScale(TEXTURE2D_ARGS(_T_forest, sampler_T_grass), uv * 1.2) * i.sa.y; wsum += i.sa.y; }
                if (i.sa.z > 0.01) { c += TEX(_T_dirt, uv * 1.3) * i.sa.z; wsum += i.sa.z; }
                if (i.sa.w > 0.01) { c += TEX(_T_gravel, uv * 1.6) * i.sa.w; wsum += i.sa.w; }
                float3 bw = pow(abs(wn), 4.0); bw /= (bw.x + bw.y + bw.z);
                if (i.sb.x > 0.01)
                {
                    #ifdef _TRIPLANAR
                        float3 rk = Tri(wp, bw, 0.09, 0);
                    #else
                        float3 rk = TEX(_T_rock, wp.xz * 0.09);
                    #endif
                    c += rk * i.sb.x; wsum += i.sb.x;
                }
                if (i.sb.y > 0.01) { c += TEX(_T_snow, uv * 0.6) * i.sb.y; wsum += i.sb.y; }
                if (i.sb.z > 0.01) { c += TwoScale(TEXTURE2D_ARGS(_T_sand, sampler_T_grass), uv * 0.7) * i.sb.z; wsum += i.sb.z; }
                c /= wsum;
                float steepK = smoothstep(0.8, 0.56, wn.y);
                #ifdef _TRIPLANAR
                    float3 rk2 = Tri(wp, bw, 0.21, 0) * 0.6 + Tri(wp, bw, 0.055, 0.3) * 0.4;
                #else
                    float3 rk2 = TEX(_T_rock, wp.xz * 0.09);
                #endif
                float rl = dot(rk2, 0.333);
                rk2 = lerp(rk2, rk2 * rl * 1.9, 0.55);
                float strata = 0.86 + 0.14 * sin(wp.y * 0.85 + sin(wp.x * 0.043 + wp.z * 0.031) * 3.0);
                float big = 0.82 + 0.18 * SAMPLE_TEXTURE2D(_T_rock, sampler_T_grass, wp.xz * 0.011 + wp.y * 0.004).r;
                rk2 *= strata * big;
                c = lerp(c, rk2 * 0.92, steepK * (1.0 - i.sb.y * 0.6));
                float3 albedo = c * 1.55 * lerp(i.col.rgb, 0.86, steepK * 0.85);
                // cheap bump from the blended albedo luminance
                float lum = dot(c, 0.333);
                float3 n = wn0;
                float3 dpx = ddx(i.wp), dpy = ddy(i.wp);
                float hx = ddx(lum), hy = ddy(lum);
                float3 r1 = cross(dpy, n), r2 = cross(n, dpx);
                float det = dot(dpx, r1);
                float3 grad = sign(det) * (hx * r1 + hy * r2) * 1.4;
                n = normalize(abs(det) * n - grad);
                Light L = GetMainLight(TransformWorldToShadowCoord(i.wp));
                half ndl = saturate(dot(n, L.direction));
                half3 col = albedo * (L.color * (ndl * L.shadowAttenuation) + SampleSH(n));
                return half4(MixFog(col, i.fog), 1);
            }
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
            float4 vert(float4 pos : POSITION) : SV_POSITION { return TransformObjectToHClip(pos.xyz); }
            half4 frag() : SV_Target { return 0; }
            ENDHLSL
        }
    }
    FallBack "Universal Render Pipeline/Simple Lit"
}
