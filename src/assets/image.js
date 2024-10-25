import icons from "./icons";

export function border(base64, size, index) {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const img = new Image();
        img.src = "data:image/jpeg;base64," + base64;
        img.crossOrigin = "anonymous";
        img.onload = () => {
            let border = Math.min(img.width*size/100, img.height*size/100);

            canvas.width = img.width+2*border;
            canvas.height = img.height+2*border;

            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(img, border, border);

            const dataURL = canvas.toDataURL("image/jpeg");
            console.log("Completed border for "+index);
            return resolve(dataURL);
        };
    });
}

const metaSuffixes = {
    shutter: "sec",
    iso: "ISO",
    focalLength: "mm"
}

export function meta(base64, borderSize, meta, index) {
    return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const img = new Image();
        img.src = "data:image/jpeg;base64," + base64;
        img.crossOrigin = "anonymous";
        img.onload = async () => {
            let unit = Math.min(img.width*0.05, img.height*0.05);
            let border = Math.min(img.width*borderSize/100, img.height*borderSize/100);
            let textSize = img.width > img.height ? unit*2 : unit*3;
            let smallTextSize = textSize/2;

            canvas.width = img.width+2*border;
            canvas.height = img.height+2*border;

            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.filter = "brightness(0.66)";
            ctx.drawImage(img, border, border);
            ctx.filter = "blur(24px) brightness(0.66)";
            ctx.drawImage(img, border, border);
            ctx.filter = "none";

            ctx.fillStyle = "white";

            let x = unit*2+textSize+unit/1.25;
            let y = unit*2+textSize/1.15;
            for (const [key, value] of Object.entries(meta)) {
                if (!value) continue;
                
                let finalTextSize = (key === "cameraModel" || key === "lensModel" || key === "copyright")
                    ? smallTextSize
                    : textSize;
                ctx.font = finalTextSize+"px Inter";

                let oldTextSizeY = y - (textSize-(finalTextSize === textSize ? textSize : finalTextSize+unit/3));
                
                ctx.fillText(value, x, oldTextSizeY);
                if (metaSuffixes[key]) {
                    let valueLength = ctx.measureText(value).width;
                    ctx.font = smallTextSize+"px Inter";
                    ctx.fillText(metaSuffixes[key], x+valueLength+unit/2, oldTextSizeY);
                }

                // convert icons[key] to base64
                let iconImg = new Image();
                iconImg.src = icons[key];
                iconImg.crossOrigin = "anonymous";
                let icon = await new Promise((resolve) => {
                    iconImg.onload = () => {
                        return resolve(iconImg);
                    }
                });

                ctx.drawImage(icon, x-unit/1.25-finalTextSize, oldTextSizeY-finalTextSize/1.15, finalTextSize, finalTextSize);

                y += finalTextSize+unit/1.5;
            }

            ctx.font = smallTextSize/2+"px Inter";
            ctx.fillText("www.hallen.uk/project/metariser", x-textSize-unit/1.25, canvas.height-unit*2);

            const dataURL = canvas.toDataURL("image/jpeg");
            console.log("Completed meta for "+index);
            return resolve(dataURL);
        };
    });
}