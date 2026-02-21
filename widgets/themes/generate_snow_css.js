
function random_range(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function generateCSS() {
    let css = `
    body {
        --enable-snow: 1;
    }
    
    .snow, .snow-fg {
        position: absolute;
        width: 10px;
        height: 10px;
        background: white;
        border-radius: 50%;
        top: -10px;
    }

    .snow {
        z-index: 1;
        opacity: 0.8;
    }

    .snow-fg {
        z-index: 100;
        width: 15px;
        height: 15px;
        filter: blur(1px);
    }
    `;


    for (let i = 1; i <= 35; i++) {
        const random_x = Math.random() * 110 - 5; 
        const random_offset = random_range(-10, 10);
        const random_x_end = random_x + random_offset;
        const random_x_end_yoyo = random_x + (random_offset / 2);
        const random_yoyo_time = random_range(30, 80) / 100;
        const random_yoyo_y = random_yoyo_time * 100;
        const random_scale = Math.random() * 0.5;
        const fall_duration = random_range(10, 30);
        const fall_delay = random_range(0, 30) * -1;
        const opacity = Math.random();

        css += `
        .snow:nth-child(${i}) {
            opacity: ${opacity};
            transform: translate(${random_x}vw, -10px) scale(${random_scale});
            animation: fall-${i} ${fall_duration}s ${fall_delay}s linear infinite;
        }

        @keyframes fall-${i} {
            ${random_yoyo_time * 100}% {
                transform: translate(${random_x_end}vw, ${random_yoyo_y}vh) scale(${random_scale});
            }
            100% {
                transform: translate(${random_x_end_yoyo}vw, 100vh) scale(${random_scale});
            }
        }
        `;
    }



    for (let i = 1; i <= 15; i++) {
        const realIndex = 35 + i;
        const random_x = Math.random() * 110 - 5; 
        const random_offset = random_range(-15, 15);
        const random_x_end = random_x + random_offset;
        const random_x_end_yoyo = random_x + (random_offset / 2);
        const random_yoyo_time = random_range(30, 80) / 100;
        const random_yoyo_y = random_yoyo_time * 100;
        const random_scale = Math.random() * 0.5 + 0.3;
        const fall_duration = random_range(15, 35);
        const fall_delay = random_range(0, 30) * -1;
        const opacity = Math.random() * 0.5 + 0.5;

        css += `
        .snow-fg:nth-child(${realIndex}) {
            opacity: ${opacity};
            transform: translate(${random_x}vw, -10px) scale(${random_scale});
            animation: fall-fg-${i} ${fall_duration}s ${fall_delay}s linear infinite;
        }

        @keyframes fall-fg-${i} {
            ${random_yoyo_time * 100}% {
                transform: translate(${random_x_end}vw, ${random_yoyo_y}vh) scale(${random_scale});
            }
            100% {
                transform: translate(${random_x_end_yoyo}vw, 100vh) scale(${random_scale});
            }
        }
        `;
    }

    const fs = require('fs');
    fs.writeFileSync('snow.css', css);
}

generateCSS();
