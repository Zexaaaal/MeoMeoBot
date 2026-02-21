class ProGradient {
    constructor(canvas, colors, seed = 0) {
        this.canvas = canvas;
        this.seed = seed;
        try {
            this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        } catch (e) {
            console.error('[ProGradient] Failed to get WebGL context', e);
        }

        const baseColors = colors || [
            [0.35, 0.21, 0.54],
            [0.59, 0.35, 0.90],
            [0.63, 0.42, 0.91],
            [0.345, 0.208, 0.529]
        ];
        this.colors = this.shuffleColors(baseColors, seed);

        this.program = null;
        this.startTime = Date.now();
        this.animationFrameId = null;
        this.running = false;
        this.positionBuffer = null;

        if (!this.gl) {
            console.error('[ProGradient] WebGL not supported');
            return;
        }

        this.init();
    }

    shuffleColors(colors, seed) {
        const shuffled = [...colors];
        let m = shuffled.length, t, i;

        const random = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        for (let k = 0; k < 10; k++) random();

        while (m) {
            i = Math.floor(random() * m--);
            t = shuffled[m];
            shuffled[m] = shuffled[i];
            shuffled[i] = t;
        }
        return shuffled;
    }

    init() {
        const vsSource = `
            attribute vec2 position;
            void main() {
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;

        const fsSource = `
            precision mediump float;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform vec3 u_color1;
            uniform vec3 u_color2;
            uniform vec3 u_color3;
            uniform vec3 u_color4;
            uniform float u_seed;

            void main() {
                // Correct Aspect Ratio
                float aspect = u_resolution.x / u_resolution.y;
                vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                uv.x *= aspect;
                
                // Speed increased (0.1 -> 0.2)
                float time = u_time * 0.2 + u_seed;

                // Point positions (adjusted for aspect ratio to keep them relative)
                vec2 p0 = vec2(0.1 * aspect, 0.9);
                vec2 p1 = vec2(0.9 * aspect, 0.9);
                vec2 p2 = vec2(0.5 * aspect, 0.1);
                
                // Moving point
                float t_x = cos(time);
                float t_y = sin(time);
                vec2 p3 = vec2((t_x * 0.4 + 0.5) * aspect, t_y * 0.4 + 0.5);
                
                vec3 c0 = u_color1;
                vec3 c1 = u_color2;
                vec3 c2 = u_color3;
                vec3 c3 = u_color4;
                
                float blend = 4.0;
                
                vec3 sum = vec3(0.0);
                float valence = 0.0;
                
                // IDW Interpolation (Unrolled)
                
                // P0
                float d0 = length(uv - p0);
                if (d0 < 0.0001) d0 = 0.0001;
                float w0 = 1.0 / pow(d0, blend);
                sum += w0 * c0;
                valence += w0;
                
                // P1
                float d1 = length(uv - p1);
                if (d1 < 0.0001) d1 = 0.0001;
                float w1 = 1.0 / pow(d1, blend);
                sum += w1 * c1;
                valence += w1;
                
                // P2
                float d2 = length(uv - p2);
                if (d2 < 0.0001) d2 = 0.0001;
                float w2 = 1.0 / pow(d2, blend);
                sum += w2 * c2;
                valence += w2;
                
                // P3
                float d3 = length(uv - p3);
                if (d3 < 0.0001) d3 = 0.0001;
                float w3 = 1.0 / pow(d3, blend);
                sum += w3 * c3;
                valence += w3;
                
                sum /= valence;
                
                gl_FragColor = vec4(sum, 1.0);
            }
        `;

        const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);

        if (!vertexShader || !fragmentShader) return;

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('[ProGradient] Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(this.program));
            return;
        }


        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        const positions = [
            -1.0, 1.0,
            1.0, 1.0,
            -1.0, -1.0,
            1.0, -1.0,
        ];
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

        this.gl.useProgram(this.program);
        const positionAttributeLocation = this.gl.getAttribLocation(this.program, "position");
        this.gl.enableVertexAttribArray(positionAttributeLocation);
        this.gl.vertexAttribPointer(positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.start();
    }

    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('[ProGradient] An error occurred compiling the shaders: ' + this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    resize() {
        if (!this.canvas) return;
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        if (this.canvas.width !== displayWidth ||
            this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    render() {
        if (!this.running || !this.gl || !this.program) return;

        this.resize();

        if (this.canvas.width === 0 || this.canvas.height === 0) {
            this.animationFrameId = requestAnimationFrame(() => this.render());
            return;
        }

        this.gl.useProgram(this.program);

        const uTimeLocation = this.gl.getUniformLocation(this.program, 'u_time');
        const uResolutionLocation = this.gl.getUniformLocation(this.program, 'u_resolution');
        const uColor1Location = this.gl.getUniformLocation(this.program, 'u_color1');
        const uColor2Location = this.gl.getUniformLocation(this.program, 'u_color2');
        const uColor3Location = this.gl.getUniformLocation(this.program, 'u_color3');
        const uColor4Location = this.gl.getUniformLocation(this.program, 'u_color4');
        const uSeedLocation = this.gl.getUniformLocation(this.program, 'u_seed');

        this.gl.uniform1f(uTimeLocation, (Date.now() - this.startTime) / 1000.0);
        this.gl.uniform2f(uResolutionLocation, this.canvas.width, this.canvas.height);
        this.gl.uniform3fv(uColor1Location, this.colors[0]);
        this.gl.uniform3fv(uColor2Location, this.colors[1]);
        this.gl.uniform3fv(uColor3Location, this.colors[2]);
        this.gl.uniform3fv(uColor4Location, this.colors[3]);
        this.gl.uniform1f(uSeedLocation, this.seed);

        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        this.animationFrameId = requestAnimationFrame(() => this.render());
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.render();
    }

    stop() {
        this.running = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
}

window.ProGradient = ProGradient;
