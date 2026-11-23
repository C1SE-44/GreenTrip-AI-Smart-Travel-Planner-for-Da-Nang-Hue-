import React, { useEffect, useRef, useState } from 'react';

interface TravelerSpriteProps {
  /** True whenever the hero is visible in viewport -> continuous walkLoop */
  active: boolean;
  /** Increments each time a scene transition starts -> triggers hand-clasp, smile, run & deceleration */
  transitionId: number;
  /** 0..1 gentle anticipation on slow scroll buildup before threshold */
  prepWeight?: number;
  reducedMotion: boolean;
}

interface CouplePose {
  // Girl (rear-left, áo dài xanh ngọc sáng, quần trắng ngà)
  gBobY: number;
  gFrontHip: number;
  gFrontKnee: number;
  gFrontFootPitch: number;
  gBackHip: number;
  gBackKnee: number;
  gBackFootPitch: number;
  gLeftArm: number;
  gLeftForearm: number;
  gRightArm: number;
  gRightForearm: number;
  rearPanelSwing: number;
  rearPanelBillow: number;
  frontPanelSwing: number;
  hairSway: number;
  // Companion (half a step ahead, front-right, áo cam san hô, quần xanh denim)
  cBobY: number;
  cFrontHip: number;
  cFrontKnee: number;
  cFrontFootPitch: number;
  cBackHip: number;
  cBackKnee: number;
  cBackFootPitch: number;
  cLeftArm: number;
  cLeftForearm: number;
  cRightArm: number;
  cRightForearm: number;
  // Shared transition choreography (0..1)
  claspWeight: number;
  runWeight: number;
  smileWeight: number;
  surgeX: number;
  leanDeg: number;
  shadowRx: number;
}

const BASE_STAND: CouplePose = {
  gBobY: 0,
  gFrontHip: -0.025,
  gFrontKnee: 0.03,
  gFrontFootPitch: 0,
  gBackHip: 0.035,
  gBackKnee: 0.03,
  gBackFootPitch: 0,
  gLeftArm: 0.05,
  gLeftForearm: 0.16,
  gRightArm: -0.04,
  gRightForearm: 0.15,
  rearPanelSwing: 0,
  rearPanelBillow: 0,
  frontPanelSwing: 0,
  hairSway: 0,
  cBobY: 0,
  cFrontHip: -0.03,
  cFrontKnee: 0.03,
  cFrontFootPitch: 0,
  cBackHip: 0.04,
  cBackKnee: 0.03,
  cBackFootPitch: 0,
  cLeftArm: -0.04,
  cLeftForearm: 0.14,
  cRightArm: 0.05,
  cRightForearm: 0.18,
  claspWeight: 0,
  runWeight: 0,
  smileWeight: 0,
  surgeX: 0,
  leanDeg: 0,
  shadowRx: 29,
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function computeLegPoints(
  hipX: number,
  hipY: number,
  hipAngle: number,
  kneeBend: number,
  thighLen: number,
  shinLen: number
) {
  const kneeX = hipX + Math.sin(hipAngle) * thighLen;
  const kneeY = hipY + Math.cos(hipAngle) * thighLen;
  const shinAngle = hipAngle - kneeBend;
  const ankleX = kneeX + Math.sin(shinAngle) * shinLen;
  const ankleY = kneeY + Math.cos(shinAngle) * shinLen;
  return { kneeX, kneeY, ankleX, ankleY, thighAngle: hipAngle, shinAngle };
}

function computeArmPoints(
  shoulderX: number,
  shoulderY: number,
  armAngle: number,
  elbowBend: number,
  upperLen: number,
  lowerLen: number
) {
  const elbowX = shoulderX + Math.sin(armAngle) * upperLen;
  const elbowY = shoulderY + Math.cos(armAngle) * upperLen;
  const forearmAngle = armAngle + elbowBend;
  const handX = elbowX + Math.sin(forearmAngle) * lowerLen;
  const handY = elbowY + Math.cos(forearmAngle) * lowerLen;
  return { elbowX, elbowY, handX, handY };
}

function solveTwoBoneIK(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  l1: number,
  l2: number,
  bendDir: 1 | -1
) {
  const dx = tx - sx;
  const dy = ty - sy;
  const rawDist = Math.hypot(dx, dy) || 0.001;
  const maxReach = l1 + l2 - 0.5;
  const minReach = Math.abs(l1 - l2) + 0.5;
  const dist = clamp(rawDist, minReach, maxReach);
  const scale = rawDist > maxReach ? maxReach / rawDist : 1;
  const clampedTx = sx + dx * scale;
  const clampedTy = sy + dy * scale;

  const cosAngle = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const baseAngle = Math.atan2(dy, dx);
  const shoulderAngle = baseAngle + bendDir * Math.acos(cosAngle);

  return {
    elbowX: sx + Math.cos(shoulderAngle) * l1,
    elbowY: sy + Math.sin(shoulderAngle) * l1,
    handX: clampedTx,
    handY: clampedTy,
  };
}

function buildTrouserPath(
  hipX: number,
  hipY: number,
  leg: ReturnType<typeof computeLegPoints>,
  hipHalfW: number,
  kneeHalfW: number,
  cuffHalfW: number
) {
  const tNx = Math.cos(leg.thighAngle);
  const tNy = -Math.sin(leg.thighAngle);
  const sNx = Math.cos(leg.shinAngle);
  const sNy = -Math.sin(leg.shinAngle);

  const hipL = [hipX - tNx * hipHalfW, hipY - tNy * hipHalfW];
  const hipR = [hipX + tNx * hipHalfW, hipY + tNy * hipHalfW];
  const kneeL = [leg.kneeX - tNx * kneeHalfW, leg.kneeY - tNy * kneeHalfW];
  const kneeR = [leg.kneeX + tNx * kneeHalfW, leg.kneeY + tNy * kneeHalfW];
  const ankleL = [leg.ankleX - sNx * cuffHalfW, leg.ankleY - sNy * cuffHalfW];
  const ankleR = [leg.ankleX + sNx * cuffHalfW, leg.ankleY + sNy * cuffHalfW];

  return `M ${hipL[0].toFixed(1)} ${hipL[1].toFixed(1)}
    L ${hipR[0].toFixed(1)} ${hipR[1].toFixed(1)}
    Q ${((hipR[0] + kneeR[0]) / 2 + 1).toFixed(1)} ${((hipR[1] + kneeR[1]) / 2).toFixed(1)} ${kneeR[0].toFixed(1)} ${kneeR[1].toFixed(1)}
    Q ${((kneeR[0] + ankleR[0]) / 2 + 1.4).toFixed(1)} ${((kneeR[1] + ankleR[1]) / 2).toFixed(1)} ${ankleR[0].toFixed(1)} ${ankleR[1].toFixed(1)}
    L ${ankleL[0].toFixed(1)} ${ankleL[1].toFixed(1)}
    Q ${((ankleL[0] + kneeL[0]) / 2 - 1.4).toFixed(1)} ${((ankleL[1] + kneeL[1]) / 2).toFixed(1)} ${kneeL[0].toFixed(1)} ${kneeL[1].toFixed(1)}
    Q ${((kneeL[0] + hipL[0]) / 2 - 1).toFixed(1)} ${((kneeL[1] + hipL[1]) / 2).toFixed(1)} ${hipL[0].toFixed(1)} ${hipL[1].toFixed(1)} Z`;
}

export const TravelerSprite: React.FC<TravelerSpriteProps> = ({
  active,
  transitionId,
  prepWeight = 0,
  reducedMotion,
}) => {
  const [pose, setPose] = useState<CouplePose>(BASE_STAND);

  const activeRef = useRef(active);
  activeRef.current = active;

  const prepWeightRef = useRef(prepWeight);
  prepWeightRef.current = prepWeight;

  const phaseRef = useRef(0);
  const transitionStartRef = useRef<number | null>(null);
  const lastTransitionIdRef = useRef(0);

  // Continuous smoothed channels so rapid repeat scrolls blend smoothly with zero snap
  const smoothedRef = useRef({
    clasp: 0,
    run: 0,
    smile: 0,
    surge: 0,
    lean: 0,
    cadence: 1,
    prep: 0,
  });

  // Trigger the continuous 0 -> 110 -> 680 -> 1320ms transition choreography
  useEffect(() => {
    if (transitionId > 0 && transitionId !== lastTransitionIdRef.current) {
      lastTransitionIdRef.current = transitionId;
      transitionStartRef.current = performance.now();
    }
  }, [transitionId]);

  useEffect(() => {
    if (reducedMotion || !active) {
      setPose(BASE_STAND);
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();

    const legCycle = (ph: number, baseHip: number, baseKnee: number, runW: number) => {
      const swingSin = Math.sin(ph);
      const swingCos = Math.cos(ph);
      const lift = Math.max(0, -swingCos);
      const strideAmp = lerp(0.235, 0.365, runW);
      const kneeLiftAmp = lerp(0.36, 0.62, runW);
      const footSwingAmp = lerp(0.11, 0.19, runW);
      const footLiftAmp = lerp(0.08, 0.16, runW);

      return {
        hip: baseHip + swingSin * strideAmp,
        knee: baseKnee + 0.05 + lift * kneeLiftAmp,
        footPitch: -swingSin * footSwingAmp + lift * footLiftAmp,
      };
    };

    const tick = (now: number) => {
      if (!activeRef.current) return;

      // Keep the imported choreography capped at 30 updates per second.
      if (now - lastTs < 1000 / 30 - 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      let targetClasp = 0;
      let targetRun = 0;
      let targetSmile = 0;
      let targetSurge = 0;
      let targetLean = 0;
      let targetCadence = 1;

      // Envelope spans 0..1360ms:
      // 0-95ms: light smile + hands reach & lock cleanly
      // 95-880ms: shared brisk running strides hand-in-hand while scene slides (TRANSITION_MS = 920ms)
      // 880-1360ms: post-arrival smooth deceleration back to slow walk & gentle unclasp
      if (transitionStartRef.current !== null) {
        const elapsed = now - transitionStartRef.current;
        if (elapsed >= 1360) {
          transitionStartRef.current = null;
        } else {
          const claspIn = smoothstep(0, 95, elapsed);
          const claspOut = smoothstep(880, 1340, elapsed);
          targetClasp = claspIn * (1 - claspOut);

          const smileIn = smoothstep(0, 100, elapsed);
          const smileOut = smoothstep(900, 1360, elapsed);
          targetSmile = smileIn * (1 - smileOut);

          const runIn = smoothstep(55, 175, elapsed);
          const runOut = smoothstep(840, 1340, elapsed);
          targetRun = runIn * (1 - runOut);

          targetSurge = targetRun * 6.0;
          targetLean = targetRun * 4.2;
          targetCadence = 1 + targetRun * 0.74;
        }
      }

      const damp = 1 - Math.exp(-dt * 12);
      const sm = smoothedRef.current;

      sm.prep = lerp(sm.prep, clamp(prepWeightRef.current, 0, 1), damp);
      const prepClasp = sm.prep * 0.42;
      const prepSmile = sm.prep * 0.65;

      const desiredClasp = Math.max(targetClasp, prepClasp);
      const claspRate = desiredClasp >= sm.clasp ? 26 : 10;
      const claspDamp = 1 - Math.exp(-dt * claspRate);

      sm.clasp = lerp(sm.clasp, desiredClasp, claspDamp);
      sm.smile = lerp(sm.smile, Math.max(targetSmile, prepSmile), damp);
      sm.run = lerp(sm.run, targetRun, damp);
      sm.surge = lerp(sm.surge, targetSurge, damp);
      sm.lean = lerp(sm.lean, targetLean, damp);
      sm.cadence = lerp(sm.cadence, targetCadence, damp);

      // Slow walk baseline: 4.25 rad/s (~24% slower than 5.6 rad/s); accelerates up to ~7.4 rad/s during shared run
      phaseRef.current = (phaseRef.current + dt * 4.25 * sm.cadence) % (Math.PI * 2);

      const pG = phaseRef.current;
      // Companion walks slightly out-of-phase (+0.85 rad) so both strides read organically
      const pC = phaseRef.current + 0.85;

      const gFront = legCycle(pG, BASE_STAND.gFrontHip, BASE_STAND.gFrontKnee, sm.run);
      const gBack = legCycle(pG + Math.PI, BASE_STAND.gBackHip, BASE_STAND.gBackKnee, sm.run);

      const cFront = legCycle(pC, BASE_STAND.cFrontHip, BASE_STAND.cFrontKnee, sm.run);
      const cBack = legCycle(pC + Math.PI, BASE_STAND.cBackHip, BASE_STAND.cBackKnee, sm.run);

      // Keep feet grounded on stance while giving a natural light bounce on running push-off
      const gStrideDrop = Math.pow(Math.sin(pG), 2) * lerp(2.1, 1.4, sm.run);
      const gFlightLift = sm.run * Math.max(0, Math.sin(pG * 2 - 0.55)) * 2.2;
      const gBobY = gStrideDrop - gFlightLift;

      const cStrideDrop = Math.pow(Math.sin(pC), 2) * lerp(2.0, 1.4, sm.run);
      const cFlightLift = sm.run * Math.max(0, Math.sin(pC * 2 - 0.55)) * 2.2;
      const cBobY = cStrideDrop - cFlightLift;

      // Outer & inner arm swings: brisker & more bent during run
      const armAmpG = lerp(0.18, 0.34, sm.run);
      const armAmpC = lerp(0.17, 0.32, sm.run);
      const runElbowBias = sm.run * 0.44;

      const gLeftArmWalk = BASE_STAND.gLeftArm - Math.sin(pG) * armAmpG;
      const gRightArmWalk = BASE_STAND.gRightArm - Math.sin(pG + Math.PI) * (armAmpG * 0.92);

      const cLeftArmWalk = BASE_STAND.cLeftArm - Math.sin(pC) * armAmpC;
      const cRightArmWalk = BASE_STAND.cRightArm - Math.sin(pC + Math.PI) * armAmpC;

      const gLeftForearm = 0.16 + Math.max(0, -Math.sin(pG)) * 0.16 + runElbowBias;
      const gRightForearm = 0.15 + Math.max(0, -Math.sin(pG + Math.PI)) * 0.14;
      const cLeftForearm = 0.14 + Math.max(0, -Math.sin(pC)) * 0.14;
      const cRightForearm = 0.18 + Math.max(0, -Math.sin(pC + Math.PI)) * 0.15 + runElbowBias;

      // Flowing jade-turquoise áo dài panels (two clear tà fluttering smoothly in step + breeze)
      const breezeBias = 1 + sm.run * 0.72 + sm.clasp * 0.25;
      const rearPanelSwing = (-5.4 + Math.sin(pG - 0.5) * 4.2) * breezeBias;
      const rearPanelBillow = (3.4 + Math.cos(pG * 2 - 0.4) * 2.3) * breezeBias;
      const frontPanelSwing = (2.8 + Math.sin(pG + 0.35) * 4.4) * breezeBias;

      setPose({
        gBobY,
        gFrontHip: gFront.hip,
        gFrontKnee: gFront.knee,
        gFrontFootPitch: gFront.footPitch,
        gBackHip: gBack.hip,
        gBackKnee: gBack.knee,
        gBackFootPitch: gBack.footPitch,
        gLeftArm: gLeftArmWalk,
        gLeftForearm,
        gRightArm: gRightArmWalk,
        gRightForearm,
        rearPanelSwing,
        rearPanelBillow,
        frontPanelSwing,
        hairSway: (-2.2 + Math.sin(pG - 0.6) * 2.0) * breezeBias,
        cBobY,
        cFrontHip: cFront.hip,
        cFrontKnee: cFront.knee,
        cFrontFootPitch: cFront.footPitch,
        cBackHip: cBack.hip,
        cBackKnee: cBack.knee,
        cBackFootPitch: cBack.footPitch,
        cLeftArm: cLeftArmWalk,
        cLeftForearm,
        cRightArm: cRightArmWalk,
        cRightForearm,
        claspWeight: sm.clasp,
        runWeight: sm.run,
        smileWeight: sm.smile,
        surgeX: sm.surge,
        leanDeg: sm.lean,
        shadowRx: 29 + Math.abs(Math.sin(pG)) * lerp(5, 7, sm.run),
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, reducedMotion]);

  // === COMPANION GEOMETRY (Half step ahead on right, grounded at y=276) ===
  const cX = 160 + pose.surgeX * 1.04;
  const cHipY = 158 + pose.cBobY;
  const cBackLeg = computeLegPoints(cX + 6, cHipY, pose.cBackHip, pose.cBackKnee, 54, 55);
  const cFrontLeg = computeLegPoints(cX - 5, cHipY, pose.cFrontHip, pose.cFrontKnee, 54, 55);
  const cRightArm = computeArmPoints(cX + 11, 88 + pose.cBobY, pose.cRightArm, pose.cRightForearm, 34, 30);
  const cLeftArmWalk = computeArmPoints(cX - 11, 90 + pose.cBobY, pose.cLeftArm, pose.cLeftForearm, 34, 30);

  // === GIRL GEOMETRY (Rear-left of couple, grounded at y=280.5) ===
  const gX = 86 + pose.surgeX * 0.92;
  const gHipY = 166 + pose.gBobY;
  const gBackLeg = computeLegPoints(gX + 6, gHipY, pose.gBackHip, pose.gBackKnee, 53, 53);
  const gFrontLeg = computeLegPoints(gX - 5, gHipY, pose.gFrontHip, pose.gFrontKnee, 53, 53);
  const gRightArmWalk = computeArmPoints(gX + 10, 94 + pose.gBobY, pose.gRightArm, pose.gRightForearm, 32, 29);
  const gLeftArm = computeArmPoints(gX - 12, 96 + pose.gBobY, pose.gLeftArm, pose.gLeftForearm, 32, 29);

  // === LOCKED 2-BONE IK HAND-CLASP GEOMETRY (Exact shared coordinate between torsos) ===
  const gShoulderX = gX + 10;
  const gShoulderY = 94 + pose.gBobY;
  const cShoulderX = cX - 11;
  const cShoulderY = 90 + pose.cBobY;

  const claspTargetX = (gShoulderX + cShoulderX) / 2;
  const claspTargetY = 142 + (pose.gBobY + pose.cBobY) * 0.5;

  const gRightArmIK = solveTwoBoneIK(gShoulderX, gShoulderY, claspTargetX, claspTargetY, 32, 29, 1);
  const cLeftArmIK = solveTwoBoneIK(cShoulderX, cShoulderY, claspTargetX, claspTargetY, 34, 30, -1);

  const gRightElbowX = lerp(gRightArmWalk.elbowX, gRightArmIK.elbowX, pose.claspWeight);
  const gRightElbowY = lerp(gRightArmWalk.elbowY, gRightArmIK.elbowY, pose.claspWeight);
  const gRightHandX = lerp(gRightArmWalk.handX, gRightArmIK.handX, pose.claspWeight);
  const gRightHandY = lerp(gRightArmWalk.handY, gRightArmIK.handY, pose.claspWeight);

  const cLeftElbowX = lerp(cLeftArmWalk.elbowX, cLeftArmIK.elbowX, pose.claspWeight);
  const cLeftElbowY = lerp(cLeftArmWalk.elbowY, cLeftArmIK.elbowY, pose.claspWeight);
  const cLeftHandX = lerp(cLeftArmWalk.handX, cLeftArmIK.handX, pose.claspWeight);
  const cLeftHandY = lerp(cLeftArmWalk.handY, cLeftArmIK.handY, pose.claspWeight);

  const renderShoe = (
    ankleX: number,
    ankleY: number,
    pitchRad: number,
    upperColor: string,
    soleColor: string
  ) => {
    const deg = (pitchRad * 180) / Math.PI;
    return (
      <g transform={`translate(${ankleX.toFixed(2)}, ${ankleY.toFixed(2)}) rotate(${deg.toFixed(2)})`}>
        <path
          d="M -6 0 Q 2 1 10 0 Q 17 1 19.5 4.2 Q 20 6.5 16 7 L -6.5 7 Q -8.5 6 -7.5 1.5 Z"
          fill={upperColor}
        />
        <path
          d="M -7.5 6.4 L 18.2 6.4 Q 19.4 7.4 17.5 8.2 L -7 8.2 Q -8.4 7.6 -7.5 6.4 Z"
          fill={soleColor}
        />
      </g>
    );
  };

  // Dynamic paths for BOTH long bright jade-turquoise áo dài panels (hai tà rõ nét)
  const rpS = pose.rearPanelSwing;
  const rpB = pose.rearPanelBillow;
  const fpS = pose.frontPanelSwing;
  const gbY = pose.gBobY;
  const cbY = pose.cBobY;

  const frontTaPath = `
    M ${gX + 2} ${(131 + gbY).toFixed(1)}
    L ${gX + 15} ${(132 + gbY).toFixed(1)}
    Q ${(gX + 21 + fpS * 0.45).toFixed(1)} ${(180 + gbY * 0.6).toFixed(1)} ${(gX + 26 + fpS).toFixed(1)} ${(234 + gbY * 0.2).toFixed(1)}
    Q ${(gX + 16 + fpS * 0.85).toFixed(1)} ${(238 + gbY * 0.2).toFixed(1)} ${(gX + 6 + fpS * 0.65).toFixed(1)} ${(235 + gbY * 0.2).toFixed(1)}
    Q ${(gX + 4 + fpS * 0.3).toFixed(1)} ${(182 + gbY * 0.6).toFixed(1)} ${gX + 2} ${(131 + gbY).toFixed(1)} Z
  `;

  const rearTaPath = `
    M ${gX - 15} ${(130 + gbY).toFixed(1)}
    Q ${gX - 6} ${(131 + gbY).toFixed(1)} ${gX + 1} ${(132 + gbY).toFixed(1)}
    Q ${(gX - 1 + rpS * 0.45 + rpB * 0.3).toFixed(1)} ${(184 + gbY * 0.6).toFixed(1)} ${(gX - 4 + rpS + rpB * 0.45).toFixed(1)} ${(241 + gbY * 0.2).toFixed(1)}
    Q ${(gX - 17 + rpS * 0.9).toFixed(1)} ${(245 + gbY * 0.2).toFixed(1)} ${(gX - 32 + rpS * 1.15 - rpB * 0.35).toFixed(1)} ${(238 + gbY * 0.2).toFixed(1)}
    Q ${(gX - 24 + rpS * 0.55 - rpB * 0.15).toFixed(1)} ${(186 + gbY * 0.6).toFixed(1)} ${gX - 15} ${(130 + gbY).toFixed(1)} Z
  `;

  const rearTaSheenPath = `
    M ${gX - 6} ${(132 + gbY).toFixed(1)}
    L ${gX + 1} ${(132 + gbY).toFixed(1)}
    Q ${(gX - 1 + rpS * 0.45 + rpB * 0.3).toFixed(1)} ${(184 + gbY * 0.6).toFixed(1)} ${(gX - 4 + rpS + rpB * 0.45).toFixed(1)} ${(241 + gbY * 0.2).toFixed(1)}
    Q ${(gX - 8 + rpS * 0.95).toFixed(1)} ${(243 + gbY * 0.2).toFixed(1)} ${(gX - 13 + rpS * 0.9).toFixed(1)} ${(242 + gbY * 0.2).toFixed(1)}
    Q ${(gX - 8 + rpS * 0.45).toFixed(1)} ${(186 + gbY * 0.6).toFixed(1)} ${gX - 6} ${(132 + gbY).toFixed(1)} Z
  `;

  const smileAlpha = clamp(0.18 + pose.smileWeight * 0.82, 0.18, 1);

  return (
    <svg
      className="traveler-svg"
      viewBox="0 0 256 296"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Cặp đôi du khách đi bộ dọc hành trình Đà Nẵng – Huế, cô gái mặc áo dài xanh ngọc sáng quần trắng ngà, chàng trai áo cam san hô quần xanh denim"
      role="img"
    >
      <defs>
        <radialGradient id="coupleGroundShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#14231C" stopOpacity="0.33" />
          <stop offset="65%" stopColor="#14231C" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#14231C" stopOpacity="0" />
        </radialGradient>

        {/* Bright luminous jade-turquoise silk áo dài (fresh, non-neon) */}
        <linearGradient id="jadeSilkMain" x1="0%" y1="0%" x2="100%" y2="85%">
          <stop offset="0%" stopColor="#1D9E8E" />
          <stop offset="52%" stopColor="#29B8A6" />
          <stop offset="100%" stopColor="#44CFC0" />
        </linearGradient>
        <linearGradient id="jadeSilkRearTa" x1="15%" y1="0%" x2="90%" y2="95%">
          <stop offset="0%" stopColor="#1B9384" />
          <stop offset="58%" stopColor="#26AE9D" />
          <stop offset="100%" stopColor="#38BFAE" />
        </linearGradient>
        <linearGradient id="jadeSilkFrontTa" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#27B3A1" />
          <stop offset="100%" stopColor="#4ED4C5" />
        </linearGradient>

        {/* Ivory-white silk trousers */}
        <linearGradient id="ivoryTrouserFront" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ECE6D8" />
          <stop offset="48%" stopColor="#F9F6EE" />
          <stop offset="100%" stopColor="#FFFDF8" />
        </linearGradient>
        <linearGradient id="ivoryTrouserBack" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#DCD5C4" />
          <stop offset="100%" stopColor="#ECE6D8" />
        </linearGradient>

        {/* Cream canvas backpack */}
        <linearGradient id="creamCanvasPack" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EFE8D7" />
          <stop offset="65%" stopColor="#E4DAC4" />
          <stop offset="100%" stopColor="#D2C5AA" />
        </linearGradient>

        {/* Companion coral-orange shirt & denim-blue trousers (fresh, non-neon) */}
        <linearGradient id="coralShirt" x1="0%" y1="0%" x2="100%" y2="90%">
          <stop offset="0%" stopColor="#DC6046" />
          <stop offset="56%" stopColor="#EB765A" />
          <stop offset="100%" stopColor="#F49177" />
        </linearGradient>
        <linearGradient id="denimFront" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#345D86" />
          <stop offset="55%" stopColor="#3E6B96" />
          <stop offset="100%" stopColor="#4B79A6" />
        </linearGradient>
        <linearGradient id="denimBack" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#27486B" />
          <stop offset="100%" stopColor="#345E86" />
        </linearGradient>
      </defs>

      {/* === GROUND CONTACT SHADOWS (both feet grounded, zero float) === */}
      <ellipse cx={cX} cy="276" rx={pose.shadowRx + 2} ry="6.4" fill="url(#coupleGroundShadow)" />
      <ellipse cx={gX - 2} cy="280.5" rx={pose.shadowRx} ry="6.7" fill="url(#coupleGroundShadow)" />

      {/* ========================================================================
          CHARACTER 2 (FRONT-RIGHT, HALF STEP AHEAD): COMPANION (CORAL + DENIM)
      ======================================================================== */}
      <g transform={`rotate(${(pose.leanDeg * 0.85).toFixed(2)} ${cX} 274)`}>
        {/* Farther right arm */}
        <g>
          <line
            x1={cX + 11}
            y1={(88 + cbY).toFixed(2)}
            x2={cRightArm.elbowX}
            y2={cRightArm.elbowY}
            stroke="#D1583E"
            strokeWidth="10.5"
            strokeLinecap="round"
          />
          <line
            x1={cRightArm.elbowX}
            y1={cRightArm.elbowY}
            x2={cRightArm.handX}
            y2={cRightArm.handY}
            stroke="#DF684D"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle cx={cRightArm.handX} cy={cRightArm.handY} r="4.2" fill="#D5A683" />
        </g>

        {/* Companion legs & denim-blue jeans */}
        <g>
          {renderShoe(cBackLeg.ankleX, cBackLeg.ankleY, pose.cBackFootPitch, '#544133', '#2A2019')}
          <path
            d={buildTrouserPath(cX + 6, cHipY, cBackLeg, 9.2, 8.3, 7.6)}
            fill="url(#denimBack)"
          />
        </g>
        <g>
          {renderShoe(cFrontLeg.ankleX, cFrontLeg.ankleY, pose.cFrontFootPitch, '#654F3E', '#2E231B')}
          <path
            d={buildTrouserPath(cX - 5, cHipY, cFrontLeg, 9.6, 8.7, 8.0)}
            fill="url(#denimFront)"
          />
        </g>

        {/* Companion torso (3/4 rear view facing right, coral shirt + tan crossbody strap) */}
        <g transform={`translate(0, ${cbY.toFixed(2)})`}>
          <path
            d={`M ${cX - 15} 78 Q ${cX + 1} 73 ${cX + 15} 80 L ${cX + 16} 118 Q ${cX + 13} 145 ${cX + 12} 161 L ${cX - 14} 160 Q ${cX - 15} 130 ${cX - 15} 78 Z`}
            fill="url(#coralShirt)"
          />
          {/* Sunlit right shoulder highlight */}
          <path
            d={`M ${cX + 8} 78 L ${cX + 15} 81 L ${cX + 16} 120 L ${cX + 12} 159 L ${cX + 6} 159 Z`}
            fill="#F9AC97"
            fillOpacity="0.45"
          />
          {/* Collar */}
          <path d={`M ${cX - 9} 72 Q ${cX} 75 ${cX + 10} 72 L ${cX + 11} 80 Q ${cX} 83 ${cX - 10} 80 Z`} fill="#C14D35" />
          {/* Subtle tan crossbody strap across back */}
          <path
            d={`M ${cX + 8} 79 Q ${cX - 3} 108 ${cX - 14} 136 L ${cX - 14} 144 Q ${cX + 1} 112 ${cX + 13} 82 Z`}
            fill="#C69D70"
            fillOpacity="0.92"
          />
          {/* Compact tan sling pouch at lower-left hip */}
          <rect x={cX - 18} y="128" width="13" height="17" rx="4" fill="#A57D53" />
        </g>

        {/* Companion head (clean 3/4 view facing forward-right, gentle smile cue, zero neck twist) */}
        <g transform={`translate(0, ${cbY.toFixed(2)})`}>
          {/* Neck */}
          <path d={`M ${cX - 5} 62 L ${cX + 7} 62 L ${cX + 7} 74 Q ${cX + 1} 76 ${cX - 5} 74 Z`} fill="#D8AC8B" />
          {/* Right cheek & profile */}
          <path
            d={`M ${cX + 1} 42 Q ${cX + 12.5} 42.5 ${cX + 13.8} 50 L ${cX + 15.2} 54.5 Q ${cX + 15} 56.4 ${cX + 13} 57.2 L ${cX + 11.4} 64 Q ${cX + 6} 66.5 ${cX - 1} 64.5 Z`}
            fill="#E7C1A1"
          />
          {/* Base cranium */}
          <ellipse cx={cX} cy="51.5" rx="12.8" ry="14.8" fill="#E3BA99" />
          {/* Subtle eye & light warm smile */}
          <ellipse cx={cX + 10.6} cy="49.8" rx="1.15" ry="1.35" fill="#231B17" />
          <path
            d={`M ${(cX + 9.2).toFixed(1)} 58.6 Q ${(cX + 11.4).toFixed(1)} ${(59.9 + pose.smileWeight * 0.45).toFixed(2)} ${(cX + 13.1).toFixed(1)} 58.4`}
            stroke="#9C6950"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity={smileAlpha.toFixed(2)}
          />
          {pose.smileWeight > 0.08 && (
            <ellipse
              cx={cX + 8.5}
              cy="55.6"
              rx="2.6"
              ry="1.6"
              fill="#DF8A73"
              fillOpacity={(pose.smileWeight * 0.34).toFixed(2)}
            />
          )}
          {/* Hair cap */}
          <path
            d={`M ${cX - 13.4} 50 Q ${cX - 12} 33 ${cX + 0.5} 32.5 Q ${cX + 12.5} 33 ${cX + 11} 44.5 Q ${cX + 6} 42.5 ${cX + 2.5} 49.5 L ${cX + 2.5} 61.5 L ${cX - 11.2} 60.5 Q ${cX - 13.6} 55.5 ${cX - 13.4} 50 Z`}
            fill="#231D19"
          />
          {/* Crown highlight */}
          <path
            d={`M ${cX - 6} 36 Q ${cX + 1} 33.5 ${cX + 7} 37`}
            stroke="#3C322B"
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity="0.55"
          />
          {/* Ear */}
          <ellipse cx={cX - 1.5} cy="53" rx="2.5" ry="3.7" fill="#D5A683" />
        </g>

        {/* Companion nearer left arm (IK-locked smoothly to clasp her right hand!) */}
        <g>
          <line
            x1={cShoulderX}
            y1={cShoulderY}
            x2={cLeftElbowX}
            y2={cLeftElbowY}
            stroke="#DF684D"
            strokeWidth="10.6"
            strokeLinecap="round"
          />
          <line
            x1={cLeftElbowX}
            y1={cLeftElbowY}
            x2={cLeftHandX}
            y2={cLeftHandY}
            stroke="#EC7A5E"
            strokeWidth="9.0"
            strokeLinecap="round"
          />
          <circle cx={cLeftHandX} cy={cLeftHandY} r="4.4" fill="#E3BA99" />
        </g>
      </g>

      {/* ========================================================================
          CHARACTER 1 (REAR-LEFT, NEARER): GIRL IN BRIGHT JADE ÁO DÀI & IVORY TROUSERS
      ======================================================================== */}
      <g transform={`rotate(${pose.leanDeg.toFixed(2)} ${gX} 278)`}>
        {/* Farther right arm — IK-locked cleanly to clasp his left hand */}
        <g>
          <line
            x1={gShoulderX}
            y1={gShoulderY}
            x2={gRightElbowX}
            y2={gRightElbowY}
            stroke="#1B8F81"
            strokeWidth="9.6"
            strokeLinecap="round"
          />
          <line
            x1={gRightElbowX}
            y1={gRightElbowY}
            x2={gRightHandX}
            y2={gRightHandY}
            stroke="#27AE9D"
            strokeWidth="8.2"
            strokeLinecap="round"
          />
          <circle cx={gRightHandX} cy={gRightHandY} r="4.2" fill="#E5BC9B" />
        </g>

        {/* Tà trước (clear front silk panel) */}
        <path
          d={frontTaPath}
          fill="url(#jadeSilkFrontTa)"
          stroke="#198276"
          strokeOpacity="0.22"
          strokeWidth="0.7"
        />

        {/* Farther leg & ivory-white silk trouser */}
        <g>
          {renderShoe(gBackLeg.ankleX, gBackLeg.ankleY, pose.gBackFootPitch, '#DDD4C0', '#7D715E')}
          <path
            d={buildTrouserPath(gX + 6, gHipY, gBackLeg, 9.5, 10.5, 11.4)}
            fill="url(#ivoryTrouserBack)"
            stroke="#C7BFA9"
            strokeWidth="0.65"
          />
        </g>

        {/* Nearer leg & ivory-white silk trouser */}
        <g>
          {renderShoe(gFrontLeg.ankleX, gFrontLeg.ankleY, pose.gFrontFootPitch, '#F3ECE0', '#8E816C')}
          <path
            d={buildTrouserPath(gX - 5, gHipY, gFrontLeg, 10.4, 11.4, 12.6)}
            fill="url(#ivoryTrouserFront)"
            stroke="#CEC6B2"
            strokeWidth="0.7"
          />
        </g>

        {/* High side-slit ivory trouser peek at hip */}
        <path
          d={`M ${gX} ${(130 + gbY).toFixed(1)} Q ${gX + 9} ${(133 + gbY).toFixed(1)} ${gX + 11} ${(148 + gbY).toFixed(1)} L ${gX + 3} ${(176 + gbY).toFixed(1)} L ${gX - 7} ${(170 + gbY).toFixed(1)} L ${gX - 4} ${(132 + gbY).toFixed(1)} Z`}
          fill="#F5F0E4"
        />

        {/* Tà sau (clear rear silk panel) */}
        <g>
          <path
            d={rearTaPath}
            fill="url(#jadeSilkRearTa)"
            stroke="#167B6F"
            strokeOpacity="0.24"
            strokeWidth="0.7"
          />
          <path d={rearTaSheenPath} fill="#64DFCF" fillOpacity="0.45" />
        </g>

        {/* Fitted bright jade-turquoise áo dài upper bodice & high collar */}
        <g transform={`translate(0, ${gbY.toFixed(2)})`}>
          <path
            d={`M ${gX - 15} 85 Q ${gX} 80 ${gX + 14} 87 L ${gX + 15} 106 Q ${gX + 11} 122 ${gX + 12} 133 L ${gX - 14} 131 Q ${gX - 12} 119 ${gX - 15} 104 Z`}
            fill="url(#jadeSilkMain)"
          />
          <path
            d={`M ${gX + 8} 85 L ${gX + 14} 88 L ${gX + 15} 107 Q ${gX + 12} 122 ${gX + 13} 133 L ${gX + 7} 132 Z`}
            fill="#66DFCF"
            fillOpacity="0.52"
          />
          {/* Mandarin standing collar */}
          <path
            d={`M ${gX - 9} 76 Q ${gX + 1} 74 ${gX + 9} 77 L ${gX + 10} 85 Q ${gX} 87 ${gX - 10} 85 Z`}
            fill="#19887B"
          />
        </g>

        {/* Head & low tied hair (3/4 rear view facing right, warm subtle smile cue) */}
        <g transform={`translate(0, ${gbY.toFixed(2)})`}>
          <path d={`M ${gX - 7} 69 L ${gX + 6} 69 L ${gX + 6} 78 Q ${gX - 1} 80 ${gX - 7} 78 Z`} fill="#E3B997" />
          <path
            d={`M ${gX} 46 Q ${gX + 11} 46 ${gX + 12} 56 L ${gX + 13.5} 60 Q ${gX + 13.5} 62 ${gX + 11} 63 L ${gX + 9} 69 Q ${gX + 6} 71 ${gX - 1} 70 Z`}
            fill="#EFC7A7"
          />
          {/* Eye dot & delicate light smile on profile */}
          <ellipse cx={gX + 9.2} cy="55.2" rx="1.1" ry="1.25" fill="#231B17" />
          <path
            d={`M ${(gX + 7.6).toFixed(1)} 63.6 Q ${(gX + 9.6).toFixed(1)} ${(64.8 + pose.smileWeight * 0.4).toFixed(2)} ${(gX + 11.2).toFixed(1)} 63.4`}
            stroke="#A46E55"
            strokeWidth="1.15"
            strokeLinecap="round"
            opacity={smileAlpha.toFixed(2)}
          />
          {pose.smileWeight > 0.08 && (
            <ellipse
              cx={gX + 6.8}
              cy="60.8"
              rx="2.4"
              ry="1.5"
              fill="#E59582"
              fillOpacity={(pose.smileWeight * 0.36).toFixed(2)}
            />
          )}
          <path
            d={`M ${gX - 15} 55 Q ${gX - 15} 39 ${gX} 39 Q ${gX + 12} 39 ${gX + 12} 52 Q ${gX + 9} 47 ${gX + 3} 49 Q ${gX + 1} 56 ${gX + 2} 66 L ${gX - 12} 67 Q ${gX - 15} 62 ${gX - 15} 55 Z`}
            fill="#1E1815"
          />
          <path
            d={`M ${gX - 9} 44 Q ${gX} 41 ${gX + 8} 45`}
            stroke="#463830"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeOpacity="0.65"
          />
          <path
            d={`M ${gX - 12} 60 Q ${gX - 16} 74 ${(gX - 19 + pose.hairSway).toFixed(1)} 94 Q ${(gX - 14 + pose.hairSway * 0.7).toFixed(1)} 97 ${(gX - 9 + pose.hairSway * 0.5).toFixed(1)} 93 Q ${gX - 7} 75 ${gX - 6} 62 Z`}
            fill="#191412"
          />
          <ellipse cx={gX - 9.5} cy="65.5" rx="3.1" ry="1.9" fill="#EDE4D2" />
        </g>

        {/* Small cream canvas backpack */}
        <g transform={`translate(0, ${gbY.toFixed(2)})`}>
          <path
            d={`M ${gX - 20} 90 Q ${gX - 26} 94 ${gX - 25} 108 L ${gX - 23} 125 Q ${gX - 18} 129 ${gX - 6} 128 L ${gX - 2} 125 L ${gX - 4} 89 Z`}
            fill="#104E47"
            fillOpacity="0.20"
          />
          <path
            d={`M ${gX - 13} 85 Q ${gX - 8} 87 ${gX - 7} 97 L ${gX - 9} 116 L ${gX - 14} 116 Q ${gX - 13} 97 ${gX - 17} 87 Z`}
            fill="#DDD2BC"
          />
          <path
            d={`M ${gX - 24} 91 Q ${gX - 24} 85 ${gX - 16} 85 L ${gX - 7} 85 Q ${gX - 2} 86 ${gX - 2} 93 L ${gX - 3} 121 Q ${gX - 3} 126 ${gX - 10} 126 L ${gX - 20} 126 Q ${gX - 26} 126 ${gX - 26} 119 Z`}
            fill="url(#creamCanvasPack)"
          />
          <path
            d={`M ${gX - 25} 92 Q ${gX - 24} 85 ${gX - 16} 85 L ${gX - 7} 85 Q ${gX - 2} 86 ${gX - 2} 93 L ${gX - 2} 100 Q ${gX - 13} 103 ${gX - 25} 100 Z`}
            fill="#F5EFE1"
          />
          <rect x={gX - 23.5} y="105" width="16" height="14" rx="4" fill="#DFD4BC" />
          <rect x={gX - 16.5} y="97" width="3.5" height="9" rx="1.4" fill="#B79B74" />
        </g>

        {/* Nearer left arm */}
        <g>
          <line
            x1={gX - 12}
            y1={(96 + gbY).toFixed(2)}
            x2={gLeftArm.elbowX}
            y2={gLeftArm.elbowY}
            stroke="#229C8E"
            strokeWidth="10.2"
            strokeLinecap="round"
          />
          <line
            x1={gLeftArm.elbowX}
            y1={gLeftArm.elbowY}
            x2={gLeftArm.handX}
            y2={gLeftArm.handY}
            stroke="#2DB4A3"
            strokeWidth="8.6"
            strokeLinecap="round"
          />
          <circle cx={gLeftArm.handX} cy={gLeftArm.handY} r="4.3" fill="#EBC2A1" />
        </g>
      </g>
    </svg>
  );
};
