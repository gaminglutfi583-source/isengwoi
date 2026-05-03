precision highp float;

uniform sampler2D uBackgroundTexture;
uniform vec2 uResolution;
uniform vec2 uBlackHoleScreenPos;
uniform float uTime;
uniform float uSchwarzschildRadius; // screen-space radius in UV
uniform float uLensStrength;
uniform vec3 uCameraWorldPos;
uniform vec3 uBlackHoleWorldPos;
uniform float uAspect;
uniform vec2 uMousePos;

varying vec2 vUv;
varying vec3 vWorldPosition;

const float PI = 3.14159265359;

// Simple lensing distortion (mimics gravitational deflection)
vec2 gravitationalLens(vec2 uv, vec2 center, float strength, float horizon) {
    vec2 delta = uv - center;
    delta.x *= uAspect; // correct for aspect ratio to keep circular shape
    float dist = length(delta);
    
    // Inside event horizon => black
    if (dist < horizon) return vec2(-1.0);
    
    // Deflection angle increases near horizon
    float deflection = 1.0 + strength * (1.0 / max(dist, horizon + 0.001) - 1.0);
    float newDist = deflection * dist;
    vec2 newDelta = normalize(delta) * newDist;
    newDelta.x /= uAspect;
    return center + newDelta;
}

// Gravitational redshift (redder near horizon)
vec3 applyRedshift(vec3 color, float dist, float horizon) {
    float redshift = 1.0 - smoothstep(horizon, horizon * 3.5, dist);
    vec3 redTint = color * vec3(1.3, 0.8, 0.6);
    return mix(color, redTint, redshift * 0.7);
}

void main() {
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    vec2 center = uBlackHoleScreenPos;
    vec2 distortedUV = gravitationalLens(screenUV, center, uLensStrength, uSchwarzschildRadius);
    
    // Check if pixel maps to inside horizon
    if (distortedUV.x < 0.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    // Clamp UV to avoid repetition artifacts
    distortedUV = clamp(distortedUV, 0.0, 1.0);
    
    // Sample background
    vec3 bgColor = texture2D(uBackgroundTexture, distortedUV).rgb;
    
    // Vignette darkening near horizon
    vec2 delta = screenUV - center;
    delta.x *= uAspect;
    float dist = length(delta);
    float vignette = smoothstep(uSchwarzschildRadius, uSchwarzschildRadius * 2.0, dist);
    bgColor *= vignette;
    
    // Gravitational redshift
    bgColor = applyRedshift(bgColor, dist, uSchwarzschildRadius);
    
    // Subtle blue shift at the inner edge (simulates accretion disk glow)
    float blueGlow = exp(-dist * 12.0) * (1.0 - smoothstep(0.0, uSchwarzschildRadius * 1.5, dist));
    bgColor += vec3(0.1, 0.2, 0.6) * blueGlow * 0.8;
    
    gl_FragColor = vec4(bgColor, 1.0);
}