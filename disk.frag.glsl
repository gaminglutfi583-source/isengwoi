precision highp float;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform vec3 uCameraPosition;
uniform vec3 uBlackHolePosition;
uniform float uDopplerStrength;

varying vec3 vWorldPosition;
varying vec2 vUv;
varying vec3 vWorldNormal;

const float PI = 3.14159265359;

// Fast 3D value noise (used for gas turbulence)
float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

void main() {
    vec3 dir = vWorldPosition - uBlackHolePosition;
    float dist = length(dir);
    
    // Discard outside disk radii
    if (dist < uInnerRadius || dist > uOuterRadius) discard;
    
    // Polar coordinates for swirling pattern
    vec3 dirNorm = normalize(dir);
    float angle = atan(dirNorm.z, dirNorm.x); // azimuth on XZ plane
    
    // Create multi-layered gas swirl
    float swirl1 = angle * 2.5 + uTime * 1.2 + dist * 0.7;
    float swirl2 = angle * 1.8 - uTime * 0.8 + dist * 1.2;
    float gas = noise(vec3(cos(swirl1)*3.0, sin(swirl1)*3.0, uTime * 0.3));
    gas += 0.6 * noise(vec3(cos(swirl2)*4.0, sin(swirl2)*4.0, uTime * 0.4));
    gas = gas * 0.5 + 0.5; // remap to 0..1
    
    // Combine with texture detail
    float texVal = texture2D(uTexture, vUv * 2.0 + vec2(uTime * 0.05, 0.0)).r;
    float combined = gas * 0.6 + texVal * 0.4;
    
    // Temperature gradient: inner hot (white-blue) to outer cooler (orange)
    float t = (dist - uInnerRadius) / (uOuterRadius - uInnerRadius);
    vec3 innerColor = vec3(0.9, 0.95, 1.3);   // hot blue-white
    vec3 outerColor = vec3(1.4, 0.65, 0.15);  // orange
    vec3 baseColor = mix(innerColor, outerColor, t);
    
    // Add turbulent variation
    baseColor += combined * 0.35;
    
    // --- Relativistic Doppler shift ---
    // Disk rotation direction (prograde around Y axis)
    vec3 rotationAxis = vec3(0.0, 1.0, 0.0);
    vec3 tangentDir = normalize(cross(rotationAxis, dirNorm));
    
    // Keplerian-like velocity (faster near center)
    float angularVelocity = 1.2 / sqrt(dist);
    vec3 velocity = tangentDir * angularVelocity;
    
    // View direction
    vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
    float radialVel = dot(velocity, viewDir); // positive = receding, negative = approaching
    
    // Color shift based on Doppler
    vec3 dopplerShift = vec3(0.0);
    if (radialVel > 0.0) {
        dopplerShift = vec3(1.0, 0.5, 0.2) * radialVel * uDopplerStrength * 0.6;
    } else {
        dopplerShift = vec3(0.2, 0.4, 1.2) * abs(radialVel) * uDopplerStrength * 0.6;
    }
    
    vec3 finalColor = baseColor + dopplerShift;
    
    // Opacity control (softer edges, turbulence variation)
    float alpha = 0.5 + combined * 0.4;
    alpha *= smoothstep(uInnerRadius, uInnerRadius + 0.15, dist);
    alpha *= 1.0 - smoothstep(uOuterRadius - 0.2, uOuterRadius, dist);
    
    gl_FragColor = vec4(finalColor, alpha);
}