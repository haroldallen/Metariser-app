import { useEffect, useState } from "react";
import { open, save } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {decode} from 'base64-arraybuffer';
import ExifReader from 'exifreader';
import { border, meta } from "./assets/image";
import iconCheck from "./assets/icons/check.svg";


export default function App() {

    const [state, setState] = useState("empty");
    const [photos, setPhotos] = useState([]);
    const [photosGenerated, setPhotosGenerated] = useState(0);
    const [results, setResults] = useState([]);
    const [resultsColumns, setResultsColumns] = useState([[], []]);
    const [resultsDir, setResultsDir] = useState("");
    const [displayDir, setDisplayDir] = useState("");
    const [universalCopyright, setUniversalCopyright] = useState(true);
    const [generateMetas, setGenerateMetas] = useState(false);
    const [borderSize, setBorderSize] = useState(2);

    async function selectDir() {
        const dir = await open({
            multiple: false,
            directory: true,
        });
        console.log(dir);
        setDisplayDir(dir.includes("/") ? dir.split("/").slice(-3).join("/") : dir.split("\\").slice(-3).join("/"));

        const entries = await readDir(dir);
        console.log(entries);

        let localPhotos = [];
        setState("loading");
        for (const entry of entries) {
            if (entry.isFile) {
                const photo = await readFile(dir+"/"+entry.name);
                const base64 = btoa(new Uint8Array(photo).reduce((data, byte) => data + String.fromCharCode(byte), ''));
                const buffer = decode(base64);

                const meta = ExifReader.load(buffer, { expanded: true });
                console.log(meta.exif);

                localPhotos.push({ base64,
                    location: dir+"/"+entry.name,
                    src: convertFileSrc(dir+"/"+entry.name),
                    meta: {
                        aperture: meta.exif.FNumber.description,
                        shutter: meta.exif.ExposureTime.description,
                        iso: meta.exif.ISOSpeedRatings.description,
                        focalLength: meta.exif.FocalLength.description.replace("mm", "").replace(" ", ""),
                        cameraModel: meta.exif.Model.description,
                        lensModel: meta.exif.LensModel.description,
                    }
                });

                setPhotosGenerated(entries.indexOf(entry)+"/"+entries.length)
            }
        }
        setPhotos(localPhotos);
        setState("idle");
    }

    function modifyPhoto(index, key, value) {
        setTimeout(()=>{
            let newPhotos = [...photos];
            console.log(newPhotos, index)
            newPhotos[index].meta[key] = value;
            console.log(photos[index], newPhotos[index], key, value)
            setPhotos(newPhotos);
        }, 10);
    }

    async function generate() {
        setPhotosGenerated(0);
        setState("generating");

        let newResults = [];
        let newColumns = generateMetas ? [[], []] : [];

        for (const photo of photos) {
            setPhotosGenerated(photos.indexOf(photo)+1);
            let index = photos.indexOf(photo);
            if (borderSize>0) {
                let imgBorder = await border(photo.base64, borderSize, index);
                newResults.push(imgBorder);
                if (generateMetas) newColumns[0].push(imgBorder);
                else newColumns.push(await border(photo.base64, borderSize, index));
            }
            if (generateMetas) {
                let imgMeta = await meta(photo.base64, borderSize, photo.meta, index);
                newResults.push(imgMeta);
                newColumns[1].push(imgMeta);
            }
        }

        if (!generateMetas) {
            let i = 0;
            let localColumns = [[], [], []];
            for (const photo of newResults) {
                let column = i % 3;
                localColumns[column].push(photo);
                i++;
            }
            newColumns = localColumns;
        }
        setResults(newResults);
        setResultsColumns(newColumns);
        setState("generated");
    }

    async function saveAll() {
        setPhotosGenerated(0);
        setState("saving");

        let result = await open({
            defaultPath: photos[0].location.split("/").slice(0, -1).join("/"),
            directory: true,
            multiple: false,
            title: "Save Metarised images"
        });
        setResultsDir(result);

        let i = 0;
        for (const photo of results) {
            setPhotosGenerated(Math.ceil(i/2)+1);

            // convert realPhoto to blob
            let base64 = photo.split(",")[1];
            let buffer = decode(base64);
            let blob = new Blob([buffer], {type: "image/jpeg"});

            const contents = new Uint8Array(await blob.arrayBuffer());

            let filename = i % 2 === 0 ? Math.ceil(i/2) : Math.ceil(i/2)-1+".meta";

            await writeFile(result+"/"+filename+".jpg", contents);

            i++;
        }
        setState("saved");
    }

    function updateCopyright(value, index=null) {
        if (universalCopyright) {
            const newPhotos = [...photos];
            newPhotos.forEach(photo => photo.meta.copyright = value);
            setPhotos(newPhotos);
        } else {
            const newPhotos = [...photos];
            newPhotos[index].meta.copyright = value;
            setPhotos(newPhotos);
        }
    }

    function borderToggle(e) {
        if (e.target.checked) setBorderSize(document.getElementById("borderSize").value)
        else setBorderSize(0)
    }

    useEffect(()=>{
        checkUpdate();
    }, []);

    async function checkUpdate() {
        let update = await check();
        if (update) {
            let downloaded = 0;
            let contentLength = 0;

            await update.downloadAndInstall((event) => {
                switch(event.event) {
                    case "Started":
                        console.log("[UPDATER] Update started")
                        setState("updating");
                        break;
                    case "Progress":
                        downloaded += event.data.chunkLength;
                        console.log(`[UPDATER] Update progress: ${downloaded}/${contentLength}`)
                        setPhotosGenerated(downloaded+"/"+contentLength)
                        break;
                    case "Finished":
                        console.log("[UPDATER] Update finished")
                        break;
                }
            });
            
            await relaunch();
        }
    }

    return <>
        { state === "empty" || photos.length === 0 ? <div className="upload">
            <p>Upload photos</p>
            <button className="button primary" onClick={()=>{ selectDir() }}>Select directory</button>
        </div> :
        <div className="app">
            <div className="left">
                { state === "loading" ? "Loading photos..."
                    : photos.length > 0
                        ? photos.map((photo, index) =>
                            <Photo key={index} index={index} src={photo.src} meta={{...photo.meta}} modifyPhoto={modifyPhoto} universalCopyright={universalCopyright} updateCopyright={updateCopyright} generateMetas={generateMetas} />)
                        : "No photos yet" }
            </div>
            <div className="right">
                <div>
                    <p>Settings</p>
                    <div className="input">
                        <p>Directory</p>
                        <p className="input click" onClick={()=>{ selectDir() }}>
                            {displayDir ? displayDir.split("/")[0].endsWith(":") ? displayDir : ".../"+displayDir : "Select directory..."}
                        </p>
                    </div>
                    <div className="toggle-wrapper">
                        <div className="toggle-label">
                            <label className="toggle">
                                <input type="checkbox" defaultChecked={true} onChange={(e)=>{borderToggle(e)}} />
                                <span></span>
                            </label>
                            <span>Frames</span>
                        </div>
                        <div className="dependant">
                            <div className="input">
                                <p>Frame size (% of image dimensions)</p>
                                <input className="input" type="number" defaultValue={2} onChange={(e)=>{setBorderSize(e.target.value)}} id="borderSize" />
                            </div>
                        </div>
                    </div>
                    <div className="toggle-wrapper">
                        <div className="toggle-label">
                            <label className="toggle">
                                <input type="checkbox" onChange={(e)=>{setGenerateMetas(e.target.checked)}} />
                                <span></span>
                            </label>
                            <span>Generate metadata photos</span>
                        </div>
                        <div className="dependant">
                            <div className="toggle-wrapper">
                                <div className="toggle-label">
                                    <label className="toggle">
                                        <input type="checkbox" defaultChecked={universalCopyright} onChange={(e)=>{setUniversalCopyright(e.target.checked)}} />
                                        <span></span>
                                    </label>
                                    <span>Same copyright on all photos</span>
                                </div>
                                <div className="dependant">
                                    <div className="input">
                                        <p className="label">Copyright</p>
                                        <input className="input" placeholder="Add a copyright..." type="text" onChange={(e)=>{updateCopyright(e.target.value)}} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <button className="button primary" onClick={()=>{ generate() }}>Generate</button>
            </div>
        </div> }
    { state === "loading" || state === "generating" || state === "generated" || state === "saving" || state === "saved" ?
        <div className="popup-wrapper" onClick={(e)=> e.currentTarget === e.target && setState("idle") }>
            { state === "loading" ? <div className="popup loading center">
                <div className="loader"></div>
                <p>Loading your photos... ({photosGenerated})</p>
            </div> : state === "generating" ? <div className="popup loading center">
                <div className="loader"></div>
                <p>Cooking up your photos ({photosGenerated}/{photos.length})</p>
            </div> : state === "generated" ? <div className="popup results">
                <p>Results</p>
                <div>
                    {resultsColumns.map((_, index) => <div className="column" key={index}>
                        { resultsColumns[index].map(result => <img src={result} width={256} />) }
                    </div>)}
                </div>
                <button className="button primary" onClick={()=>{saveAll()}}>Save photos</button>
            </div> : state === "saving" ? <div className="popup loading center">
                <div className="loader"></div>
                <p>Saving your photos... ({photosGenerated}/{photos.length})</p>
            </div> : state === "saved" ? <div className="popup center">
                <img src={iconCheck} height={36} />
                <p>
                    Your photos have been saved!
                    <br />
                    Directory: {resultsDir}
                </p>
            </div> : <></> }
        </div> : <></> }
    </>;
}

function Photo({ index, src, meta, modifyPhoto, universalCopyright, updateCopyright, generateMetas }) {
    if (!generateMetas) return <div className="photo"><img src={src} /></div>;

    return <div className="photo">
        <img src={src} />
        { meta ? <div className="meta">
            <div className="settings">
                <div>
                    <p className="label">Aperture</p>
                    <input contentEditable={true} onChange={(e)=>{ modifyPhoto(index, "aperture", e.target.value) }} placeholder="..." defaultValue={meta.aperture} />
                </div>
                <div>
                    <p className="label">Shutter</p>
                    <input contentEditable={true} onChange={(e)=>{ modifyPhoto(index, "shutter", e.target.value) }} placeholder="..." defaultValue={meta.shutter} />
                </div>
                <div>
                    <p className="label">ISO</p>
                    <input contentEditable={true} onChange={(e)=>{ modifyPhoto(index, "iso", e.target.value) }} placeholder="..." defaultValue={meta.iso} />
                </div>
                <div>
                    <p className="label">Fcl. Len.</p>
                    <input contentEditable={true} onChange={(e)=>{ modifyPhoto(index, "focalLength", e.target.value) }} placeholder="..." defaultValue={meta.focalLength} />
                </div>
            </div>
            <div>
                <p className="label">Camera</p>
                <input contentEditable={true} onChange={(e)=>{ modifyPhoto(index, "cameraModel", e.target.value) }} placeholder="Add a camera..." defaultValue={meta.cameraModel} />
            </div>
            <div>
                <p className="label">Lens</p>
                <input contentEditable={true} onChange={(e)=>{ modifyPhoto(index, "lensModel", e.target.value) }} placeholder="Add a lens..." defaultValue={meta.lensModel} />
            </div>
            { universalCopyright ? <></>
                : <div>
                <p className="label">Copyright</p>
                <input contentEditable={true} onChange={(e)=>{ updateCopyright(e.target.value, index) }} placeholder="Add a copyright..." defaultValue={meta.copyright} />
            </div>}
        </div> : <></> }
    </div>;
}