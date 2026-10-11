// Tyre marks: multiplies what's below by the vertex colour (white = no mark).
Shader "Downfall/Skid"
{
    Properties { }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent-40" "RenderPipeline" = "UniversalPipeline" }
        Pass
        {
            Tags { "LightMode" = "UniversalForward" }
            Blend DstColor Zero
            ZWrite Off
            Cull Off
            Offset -4, -4
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            struct A { float4 pos : POSITION; half4 col : COLOR; };
            struct V { float4 pos : SV_POSITION; half4 col : COLOR; };
            V vert(A i) { V o; o.pos = TransformObjectToHClip(i.pos.xyz); o.col = i.col; return o; }
            half4 frag(V i) : SV_Target { return half4(i.col.rgb, 1); }
            ENDHLSL
        }
    }
    FallBack Off
}
