// Procedural sky (port of env.js skyFrag) used as RenderSettings.skybox: horizon/zenith gradient,
// sun disc + glow, fbm clouds drifting with _SkyTime (SKY_HQ: cirrus streaks and domain-warped,
// sun-lit cumulus), lightning flash. Directions are mirrored back to game space so clouds and
// the sun sit where they do in the web build; _SunDir is a game-space vector.
Shader "Downfall/Sky"
{
    Properties
    {
        _Top ("Top", Color) = (0.36, 0.52, 0.71, 1)
        _Horizon ("Horizon", Color) = (0.79, 0.84, 0.87, 1)
        _Sun ("Sun", Color) = (1, 0.9, 0.75, 1)
        _SunDir ("Sun Dir (game space)", Vector) = (0, 1, 0, 0)
        _Cloud ("Clouds", Float) = 0.4
        _CloudDark ("Cloud Dark", Float) = 0.1
        _SkyTime ("Time", Float) = 0
        _Flash ("Flash", Float) = 0
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Background" "PreviewType" = "Skybox" "RenderPipeline" = "UniversalPipeline" }
        Cull Off ZWrite Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_local _ SKY_HQ
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                float4 _Top, _Horizon, _Sun, _SunDir;
                float _Cloud, _CloudDark, _SkyTime, _Flash;
            CBUFFER_END

            struct A { float4 pos : POSITION; };
            struct V { float4 pos : SV_POSITION; float3 dir : TEXCOORD0; };

            V vert(A i)
            {
                V o;
                o.pos = TransformObjectToHClip(i.pos.xyz);
                o.dir = i.pos.xyz;
                return o;
            }

            float hash(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
            float vn(float2 p)
            {
                float2 i = floor(p), f = frac(p); f = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(hash(i), hash(i + float2(1, 0)), f.x), lerp(hash(i + float2(0, 1)), hash(i + float2(1, 1)), f.x), f.y);
            }
            float fbm(float2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }

            half4 frag(V i) : SV_Target
            {
                float3 d = normalize(float3(-i.dir.x, i.dir.y, i.dir.z));
                float3 sunDir = normalize(_SunDir.xyz);
                float h = d.y;
                float3 top = _Top.rgb, hor = _Horizon.rgb, sun = _Sun.rgb;
                float3 col = lerp(hor, top, pow(saturate(h), 0.5));
                col = lerp(col, hor * 0.92, smoothstep(0.02, -0.25, h));
                float sd = max(dot(d, sunDir), 0.0);
                col += sun * (pow(sd, 1400.0) * 14.0 + pow(sd, 18.0) * 0.22 + pow(sd, 3.0) * 0.08) * (1.0 - _Cloud * 0.6);
                if (h > -0.02)
                {
                    float2 bse = d.xz / (h + 0.11);
                    float2 uv = bse * 0.55 + float2(_SkyTime * 0.006, _SkyTime * 0.002);
                    float cov = lerp(0.70, 0.34, _Cloud);
                    #ifdef SKY_HQ
                        float2 cu = bse * 0.16 + float2(_SkyTime * 0.004, 0.0);
                        float ci = fbm(float2(cu.x * 3.2, cu.y * 0.55));
                        col = lerp(col, lerp(1.0, sun, 0.25), smoothstep(0.56, 0.86, ci) * 0.32 * smoothstep(0.06, 0.4, h) * (1.0 - _Cloud * 0.6));
                        float2 w = float2(fbm(uv * 0.7 + 1.7), fbm(uv * 0.7 + 9.2)) - 0.5;
                        float n = fbm(uv * 1.3 + w) * 0.72 + fbm(uv * 4.1 + 3.7 + w * 1.5) * 0.28;
                        float2 sdir = normalize(sunDir.xz + 1e-4);
                        float2 uv2 = uv + sdir * 0.07;
                        float n2 = fbm(uv2 * 1.3 + w) * 0.72 + fbm(uv2 * 4.1 + 3.7 + w * 1.5) * 0.28;
                        float shade = saturate((n2 - n) * 5.0 + 0.45);
                    #else
                        float n = fbm(uv * 1.3) * 0.75 + fbm(uv * 4.1 + 3.7) * 0.25;
                        float shade = 0.4;
                    #endif
                    float a = smoothstep(cov, cov + 0.17, n) * smoothstep(-0.02, 0.16, h);
                    float thick = smoothstep(cov, cov + 0.45, n);
                    float3 lit = lerp(1.0, sun, 0.4) * (0.98 + pow(sd, 8.0) * 0.6);
                    float3 dark = lerp(hor * 0.78, float3(0.30, 0.33, 0.38), 0.55);
                    float3 cc = lerp(lit, dark, saturate(thick * (0.3 + _CloudDark) + shade * 0.38));
                    cc += sun * pow(sd, 10.0) * (1.0 - thick) * 0.9;
                    cc = lerp(hor, cc, 0.3 + 0.7 * smoothstep(0.0, 0.22, h));
                    col = lerp(col, cc, a * 0.95);
                }
                col += float3(0.85, 0.88, 1.0) * _Flash;
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
