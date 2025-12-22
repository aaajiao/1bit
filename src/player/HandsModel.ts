// 1-bit Chimera Void - Hands Model
import * as THREE from 'three';
import { createFlowerProp, animateFlower } from './FlowerProp';
import type { FingerStructure, ThumbStructure } from '../types';

interface FlowerGroup extends THREE.Group {
    userData: {
        bloom?: THREE.Group;
        coreLight?: THREE.PointLight;
        intensity: number;
        targetIntensity: number;
        isBeingForced: boolean;
        forcedIntensity: number;
    };
}

/**
 * Creates anatomically detailed hand models
 */
export class HandsModel {
    private camera: THREE.PerspectiveCamera;
    private handsGroup: THREE.Group = new THREE.Group();
    private time: number = 0;
    private leftHand!: THREE.Group;
    private rightHand!: THREE.Group;
    private flower: FlowerGroup | null = null;

    // Materials
    private handMat: THREE.MeshLambertMaterial;
    private jointMat: THREE.MeshLambertMaterial;

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;
        this.handMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
        this.jointMat = new THREE.MeshLambertMaterial({ color: 0x444444 });

        // Build hands
        this.init();

        camera.add(this.handsGroup);
    }

    /**
     * Initialize hands
     */
    private init(): void {
        // Hand light
        const handLight = new THREE.DirectionalLight(0xffffff, 0.5);
        handLight.position.set(0, 2, 0);
        this.handsGroup.add(handLight);

        // Left hand
        this.leftHand = this.createHandModel(true);
        this.leftHand.position.set(-0.55, -0.6, -0.85);
        this.leftHand.rotation.set(-0.3, -0.2, -0.15);
        this.handsGroup.add(this.leftHand);

        // Right hand (with flower)
        this.rightHand = this.createHandModel(false);
        this.rightHand.position.set(0.6, -0.7, -0.9);
        this.rightHand.rotation.set(-0.2, 0.4, 0.3);
        this.handsGroup.add(this.rightHand);
    }

    /**
     * Create a finger with 3 phalanges
     */
    private createFinger(length: number, width: number): FingerStructure {
        const root = new THREE.Group();
        const l1 = length * 0.45;
        const l2 = length * 0.3;
        const l3 = length * 0.25;
        const w = width;

        // Proximal
        const s1 = new THREE.Mesh(
            new THREE.BoxGeometry(w, w * 0.85, l1),
            this.handMat
        );
        s1.position.z = -l1 / 2;
        root.add(s1);

        // Joint 1
        const j1 = new THREE.Mesh(
            new THREE.SphereGeometry(w * 0.55, 8, 8),
            this.jointMat
        );
        j1.position.z = -l1;
        root.add(j1);

        // Middle
        const s2Group = new THREE.Group();
        s2Group.position.z = -l1;
        root.add(s2Group);

        const s2 = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.9, w * 0.8, l2),
            this.handMat
        );
        s2.position.z = -l2 / 2;
        s2Group.add(s2);

        // Joint 2
        const j2 = new THREE.Mesh(
            new THREE.SphereGeometry(w * 0.5, 8, 8),
            this.jointMat
        );
        j2.position.z = -l2;
        s2Group.add(j2);

        // Distal
        const s3Group = new THREE.Group();
        s3Group.position.z = -l2;
        s2Group.add(s3Group);

        const s3 = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.8, w * 0.7, l3),
            this.handMat
        );
        s3.position.z = -l3 / 2;
        s3Group.add(s3);

        return { root, s1, s2: s2Group, s3: s3Group, length };
    }

    /**
     * Create thumb
     */
    private createThumb(width: number): ThumbStructure {
        const root = new THREE.Group();
        const l2 = 0.12;
        const l3 = 0.1;

        const s1Group = new THREE.Group();
        root.add(s1Group);

        const s1 = new THREE.Mesh(
            new THREE.BoxGeometry(width, width * 0.9, l2),
            this.handMat
        );
        s1.position.z = -l2 / 2;
        s1Group.add(s1);

        const j1 = new THREE.Mesh(
            new THREE.SphereGeometry(width * 0.55, 8, 8),
            this.jointMat
        );
        j1.position.z = -l2;
        s1Group.add(j1);

        const s2Group = new THREE.Group();
        s2Group.position.z = -l2;
        s1Group.add(s2Group);

        const s2 = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.9, width * 0.8, l3),
            this.handMat
        );
        s2.position.z = -l3 / 2;
        s2Group.add(s2);

        return { root, s1: s1Group, s2: s2Group };
    }

    /**
     * Create complete hand model
     */
    private createHandModel(isLeft: boolean): THREE.Group {
        const g = new THREE.Group();
        const handMeshGroup = new THREE.Group();
        g.add(handMeshGroup);

        // Forearm
        const armGeo = new THREE.CylinderGeometry(0.09, 0.13, 3.5, 10);
        const arm = new THREE.Mesh(armGeo, this.handMat);
        arm.rotation.x = Math.PI / 2;
        arm.scale.set(1.2, 1, 0.85);
        arm.position.z = 1.85;
        handMeshGroup.add(arm);

        // Wrist
        const wrist = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.08, 0.1),
            this.jointMat
        );
        wrist.position.z = 0.15;
        handMeshGroup.add(wrist);

        // Palm
        const palmGroup = new THREE.Group();
        handMeshGroup.add(palmGroup);

        const palm = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, 0.06, 0.32),
            this.handMat
        );
        palm.position.z = -0.05;
        palmGroup.add(palm);

        // Thenar
        const thenar = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 12, 12),
            this.handMat
        );
        thenar.scale.set(1.0, 0.6, 1.4);
        thenar.position.set(isLeft ? 0.1 : -0.1, -0.04, 0.02);
        thenar.rotation.z = isLeft ? -0.3 : 0.3;
        palmGroup.add(thenar);

        // Hypothenar
        const hypo = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 12, 12),
            this.handMat
        );
        hypo.scale.set(0.8, 0.5, 1.2);
        hypo.position.set(isLeft ? -0.1 : 0.1, -0.04, 0.05);
        palmGroup.add(hypo);

        // Fingers
        const fIndex = this.createFinger(0.38, 0.065);
        fIndex.root.position.set(isLeft ? 0.1 : -0.1, 0, -0.21);
        fIndex.root.rotation.y = isLeft ? -0.05 : 0.05;
        handMeshGroup.add(fIndex.root);

        const fMid = this.createFinger(0.42, 0.068);
        fMid.root.position.set(0, 0, -0.22);
        handMeshGroup.add(fMid.root);

        const fRing = this.createFinger(0.39, 0.065);
        fRing.root.position.set(isLeft ? -0.1 : 0.1, 0, -0.21);
        fRing.root.rotation.y = isLeft ? 0.03 : -0.03;
        handMeshGroup.add(fRing.root);

        const fPinky = this.createFinger(0.3, 0.055);
        fPinky.root.position.set(isLeft ? -0.19 : 0.19, -0.01, -0.19);
        fPinky.root.rotation.y = isLeft ? 0.15 : -0.15;
        handMeshGroup.add(fPinky.root);

        // Thumb
        const fThumb = this.createThumb(0.075);
        fThumb.root.position.set(isLeft ? 0.16 : -0.16, -0.02, -0.02);
        fThumb.root.rotation.y = isLeft ? -0.8 : 0.8;
        fThumb.root.rotation.x = 0.2;
        handMeshGroup.add(fThumb.root);

        // Posing
        if (!isLeft) {
            // Right hand - grip pose
            handMeshGroup.rotation.set(-0.2, -0.3, -0.5);
            handMeshGroup.position.set(0.05, 0.1, 0.0);

            [fIndex, fMid, fRing, fPinky].forEach((f, i) => {
                f.root.rotation.x = -1.5 - i * 0.1;
                f.s2.rotation.x = -1.2;
                f.s3.rotation.x = -0.8;
            });

            fThumb.root.rotation.y = 1.5;
            fThumb.root.rotation.x = 0.5;
            fThumb.s1.rotation.x = -0.3;
            fThumb.s2.rotation.x = -0.7;

            // Add flower
            const flower = createFlowerProp() as FlowerGroup;
            g.add(flower);
            // Store reference for external access
            g.userData.flower = flower;
        } else {
            // Left hand - relaxed pose
            fIndex.root.rotation.x = 0.2;
            fIndex.s2.rotation.x = 0.2;
            fIndex.s3.rotation.x = 0.1;
            fMid.root.rotation.x = 0.25;
            fMid.s2.rotation.x = 0.25;
            fMid.s3.rotation.x = 0.1;
            fRing.root.rotation.x = 0.3;
            fRing.s2.rotation.x = 0.3;
            fRing.s3.rotation.x = 0.15;
            fPinky.root.rotation.x = 0.35;
            fPinky.s2.rotation.x = 0.35;
            fPinky.s3.rotation.x = 0.15;
            fThumb.root.rotation.x = 0.3;
            fThumb.s2.rotation.x = 0.2;
        }

        return g;
    }

    /**
     * Animate hands
     * @param delta - Delta time in seconds
     * @param isMoving - Whether player is moving
     * @param timeMs - Current time in ms
     */
    animate(delta: number, isMoving: boolean, timeMs: number): void {
        this.time += delta;
        const sway = isMoving
            ? Math.sin(this.time * 10) * 0.05
            : Math.sin(this.time * 2) * 0.01;

        this.leftHand.rotation.z = -0.1 + sway;
        this.rightHand.rotation.z = 0.1 - sway;

        // Get camera pitch (rotation.x) - positive when looking up
        const pitch = this.camera.rotation.x;

        // Only lower hands when looking UP (pitch > 0)
        // When looking down or straight, keep hands at normal position
        const pitchOffset = pitch > 0 ? pitch * 1.5 : 0;

        // Apply breathing + pitch-based offset (subtract to move down)
        this.handsGroup.position.y = Math.sin(this.time * 2) * 0.02 - pitchOffset;

        // Animate flower on right hand
        this.rightHand.children.forEach(child => {
            const flowerChild = child as FlowerGroup;
            if (flowerChild.userData?.bloom) {
                animateFlower(flowerChild, timeMs * 0.001, delta);
            }
        });
    }

    /**
     * Get reference to the flower prop
     */
    getFlower(): FlowerGroup | null {
        // Find flower in right hand
        for (const child of this.rightHand.children) {
            const flowerChild = child as FlowerGroup;
            if (flowerChild.userData?.bloom) {
                return flowerChild;
            }
        }
        return null;
    }
}
