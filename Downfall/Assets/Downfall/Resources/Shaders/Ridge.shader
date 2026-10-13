// Distant mountain ranges (env.js ridgeFrag): base colour with a snow line, faded into the haze.
// Drawn in the Background queue just in front of the far plane, so they never clip against the
// camera far distance and everything real draws over them (and the skybox does not).
Shader "Downfall/Ridge"
{
    Properties
    {
        _Base ("Base", Color) = (0.29, 0.31, 0.35, 1)
        _Haze ("Haze", Color) = (0.7, 0.75, 0.8, 1)
        _HazeAmt ("Haze Amount", Float) = 0.25
        _Snow ("Snow", Color) = (0.91, 0.93, 0.96, 1)
        _SnowLine ("Snow Line", Float) = 300
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        Cull Off ZWrite On ZTest LEqual
        Pass
        {
            Name "Ridge"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial)
                float4 _Base, _Haze, _Snow;
                float _HazeAmt, _SnowLine;
            CBUFFER_END
            struct A { float4 pos : POSITION; float2 uv : TEXCOORD0; };
            struct V { float4 pos : SV_POSITION; float h : TEXCOORD0; float n : TEXCOORD1; };
            V vert(A i)
            {
                V o;
                o.pos = TransformObjectToHClip(i.pos.xyz);
                #if UNITY_REVERSED_Z
                    o.pos.z = o.pos.w * 1e-5;
                #else
                    o.pos.z = o.pos.w * (1.0 - 1e-5);
                #endif
                o.h = i.pos.y; o.n = i.uv.x;
                return o;
            }
            half4 frag(V i) : SV_Target
            {
                float3 c = _Base.rgb * (0.8 + i.n * 0.3);
                c = lerp(c, _Snow.rgb, smoothstep(_SnowLine, _SnowLine + 60.0, i.h + i.n * 40.0));
                c = lerp(c, _Haze.rgb, _HazeAmt);
                return half4(c, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
