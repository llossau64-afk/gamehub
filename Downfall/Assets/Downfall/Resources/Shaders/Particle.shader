// Soft camera-facing particles: texture alpha x vertex colour, optional fog.
// Blend factors are set per material (alpha for smoke and dust, additive for sparks).
Shader "Downfall/Particle"
{
    Properties
    {
        _MainTex ("Sprite", 2D) = "white" {}
        [Enum(UnityEngine.Rendering.BlendMode)] _Src ("Src", Float) = 5
        [Enum(UnityEngine.Rendering.BlendMode)] _Dst ("Dst", Float) = 10
        _Fog ("Fog", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent" "RenderPipeline" = "UniversalPipeline" "IgnoreProjector" = "True" }
        Pass
        {
            Name "Particle"
            Tags { "LightMode" = "UniversalForward" }
            Blend [_Src] [_Dst]
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_MainTex); SAMPLER(sampler_MainTex);
            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST;
                float _Src, _Dst, _Fog;
            CBUFFER_END

            struct A { float4 pos : POSITION; float2 uv : TEXCOORD0; half4 col : COLOR; };
            struct V { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; half4 col : COLOR; float fog : TEXCOORD1; };

            V vert(A i)
            {
                V o;
                o.pos = TransformObjectToHClip(i.pos.xyz);
                o.uv = i.uv;
                o.col = i.col;
                o.fog = ComputeFogFactor(o.pos.z);
                return o;
            }

            half4 frag(V i) : SV_Target
            {
                half a = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, i.uv).a * i.col.a;
                clip(a - 0.01);
                half3 c = i.col.rgb;
                if (_Fog > 0.5) c = MixFog(c, i.fog);
                return half4(c, a);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
