// 1-bit Chimera Void - Flora Factory (Trees)
import * as THREE from 'three';
import { hash } from '../utils/hash.js';

/**
 * Creates a procedural tree with trunk, branches, and canopy
 * @param {THREE.Group} buildGroup - Parent group
 * @param {Object} params - Generation parameters
 * @param {Array} animatedObjects - Array to collect animated objects
 * @returns {number} Maximum height of tree
 */
export function createTree(buildGroup, params, animatedObjects) {
    const { i, cx, cz, assets } = params;

    const sizeGene = hash(i, cz * cx);
    const globalScale = 0.5 + Math.pow(sizeGene, 4) * 4.0;

    const trunkHeightBase = 10 + hash(i, cz) * 10;
    const trunkHeight = trunkHeightBase * globalScale;

    const trunkWidthBase = 0.8 + hash(i, cx) * 1.2;
    const trunkBaseWidth = trunkWidthBase * globalScale;

    const leanAmount = (hash(i, i) - 0.5) * (2.0 + hash(cx, i) * 4.0);
    const leanDirX = Math.sin(hash(i, 0) * Math.PI * 2);
    const leanDirZ = Math.cos(hash(i, 0) * Math.PI * 2);

    const shapeProfile = Math.floor(hash(i, trunkHeight) * 3);
    const segmentCount = Math.max(2, Math.floor(trunkHeight / 3));

    // Create trunk segments
    for (let t = 0; t < segmentCount; t++) {
        const tRatio = t / segmentCount;
        const segHeight = trunkHeight / segmentCount;

        const taper = 1.0 - Math.pow(tRatio, 1.5) * 0.8;
        const wBottom = trunkBaseWidth * taper;

        const seg = new THREE.Mesh(assets.cylinderGeo, assets.matTreeBark);
        seg.scale.set(wBottom, segHeight, wBottom);

        const leanCurve = Math.pow(tRatio, 1.5) * leanAmount;
        const curveX = leanDirX * leanCurve;
        const curveZ = leanDirZ * leanCurve;

        const wiggle = Math.sin(t * 1.5 + hash(i, 0) * 10) * (trunkBaseWidth * 0.3);

        seg.position.set(
            curveX + wiggle,
            t * segHeight + segHeight / 2,
            curveZ + wiggle
        );

        seg.rotation.z = -(leanDirX * leanAmount * 0.05) + (hash(t, i) - 0.5) * 0.1;
        seg.rotation.x = leanDirZ * leanAmount * 0.05 + (hash(i, t) - 0.5) * 0.1;
        seg.rotation.y = hash(t, t) * 0.5;

        seg.castShadow = true;
        seg.receiveShadow = true;
        buildGroup.add(seg);
    }

    // Create canopy levels
    const levels = 2 + Math.floor(hash(i, i) * 3) + (globalScale > 2 ? 2 : 0);
    const canopyStartRatio = 0.2 + hash(i, cx) * 0.6;

    for (let l = 0; l < levels; l++) {
        const lRatio = l / Math.max(1, levels - 1);
        const minH = trunkHeight * canopyStartRatio;
        const currentHeight = minH + (trunkHeight - minH) * lRatio;

        const tRatioGlobal = currentHeight / trunkHeight;
        const leanCurve = Math.pow(tRatioGlobal, 1.5) * leanAmount;
        const trunkX = leanDirX * leanCurve;
        const trunkZ = leanDirZ * leanCurve;

        let reachBase = 5 * globalScale;
        if (shapeProfile === 0) {
            reachBase = reachBase * (1.0 - lRatio * 0.8) + 2;
        } else if (shapeProfile === 1) {
            reachBase = reachBase * Math.sin(lRatio * Math.PI) + 2;
        } else {
            reachBase = reachBase * (0.5 + lRatio) + 2;
        }

        const branches = 2 + Math.floor(hash(l, i) * (3 + globalScale));

        for (let b = 0; b < branches; b++) {
            const angle = (b / branches) * Math.PI * 2 + l * 1.5 + hash(b, l);
            const reach = reachBase * (0.7 + hash(b, l) * 0.6);

            const bGroup = new THREE.Group();
            bGroup.position.set(trunkX, currentHeight, trunkZ);
            bGroup.rotation.y = angle;

            const droopGene = hash(i, b) > 0.5 ? 1 : -1;
            const angleUp = Math.PI / 2.5 - lRatio * 0.8 + (hash(b, i) - 0.5) * 0.3 * droopGene;

            bGroup.userData = {
                animType: 'BRANCH_SWAY',
                initialRotZ: angleUp,
                speed: 0.5 + hash(b, l),
                phase: hash(l, b) * Math.PI,
                rigidity: (1.0 - lRatio * 0.5) * (globalScale > 2 ? 2.0 : 1.0),
            };
            bGroup.rotation.z = angleUp;
            animatedObjects.push(bGroup);

            // Branch cone
            const branch = new THREE.Mesh(assets.coneGeo, assets.matTreeBark);
            branch.scale.set(
                trunkBaseWidth * 0.15,
                reach,
                trunkBaseWidth * 0.15
            );
            branch.position.y = reach / 2;
            bGroup.add(branch);

            // Leaf clusters
            const clusterSize = 2 + Math.floor(hash(b, l) * 4);
            const clusterSpread = (1.0 + hash(l, b) * 2.0) * globalScale * 0.5;

            for (let leaf = 0; leaf < clusterSize; leaf++) {
                const leafMesh = new THREE.Mesh(assets.tetraGeo, assets.matWire);
                const ls = (0.8 + hash(leaf, b) * 1.5) * globalScale * 0.6;
                leafMesh.scale.set(ls, ls, ls);

                leafMesh.position.set(
                    (hash(leaf, 0) - 0.5) * clusterSpread,
                    reach + (hash(leaf, 1) - 0.5) * clusterSpread,
                    (hash(leaf, 2) - 0.5) * clusterSpread
                );

                leafMesh.userData = {
                    animType: 'LEAF_FLUTTER',
                    speed: 2.0 + hash(leaf, l) * 2.0,
                    phase: hash(leaf, i) * Math.PI,
                    baseScale: leafMesh.scale.clone(),
                };
                animatedObjects.push(leafMesh);

                // Rare fruit
                if (hash(leaf, i) > 0.95) {
                    const fruit = new THREE.Mesh(assets.blobGeo, assets.matPlasma.clone());
                    const fs = 0.5 * globalScale;
                    fruit.scale.set(fs, fs, fs);
                    fruit.position.copy(leafMesh.position);
                    fruit.position.y -= ls;
                    fruit.userData = {
                        isPlasma: true,
                        animType: 'LEAF_FLUTTER',
                        speed: 1.0,
                        phase: 0,
                    };
                    animatedObjects.push(fruit);
                    bGroup.add(fruit);
                }

                bGroup.add(leafMesh);
            }

            buildGroup.add(bGroup);
        }
    }

    return trunkHeight + 5;
}
