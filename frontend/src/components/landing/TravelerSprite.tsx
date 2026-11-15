import React, { useEffect, useRef, useState } from 'react';

interface TravelerSpriteProps {
  /** True whenever the hero is visible in viewport -> continuous walkLoop */
  active: boolean;
  /** Increments each time a scene transition starts -> triggers the 0-430-820ms glance/hand-clasp/pull beat */
  transitionId: number;
  reducedMotion: boolean;
}

interface CouplePose {
  // Girl (rear-left, áo dài xanh ngọc)
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
  // Companion (half a step ahead, right-front)
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
  lookBack: number;
  claspWeight: number;
  surgeX: number;
  leanDeg: number;
  shadowRx: number;
}

const BASE_STAND: CouplePose = {
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
  lookBack: 0,
  claspWeight: 0,
  surgeX: 0,
  leanDeg: 0,
  shadowRx: 30,
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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
  reducedMotion,
}) => {
  const [pose, setPose] = useState<CouplePose>(BASE_STAND);

  const activeRef = useRef(active);
  activeRef.current = active;

  const phaseRef = useRef(0);
  const transitionStartRef = useRef<number | null>(null);
  const lastTransitionIdRef = useRef(0);

  // Trigger the 0-150-430-820ms transition gesture whenever transitionId increments
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

    const legCycle = (ph: number, baseHip: number, baseKnee: number, amp = 0.27) => {
      const swingSin = Math.sin(ph);
      const swingCos = Math.cos(ph);
      const lift = Math.max(0, -swingCos);
      return {
        hip: baseHip + swingSin * amp,
        knee: baseKnee + 0.06 + lift * 0.42,
        footPitch: -swingSin * 0.16 + lift * 0.11,
      };
    };

    const tick = (now: number) => {
      if (!activeRef.current) return;

      // Keep the same walk at 30 updates/s, including high-refresh-rate displays.
      if (now - lastTs < 1000 / 30 - 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      // Transition gesture envelope (0 -> 820 ms)
      let lookBack = 0;
      let claspWeight = 0;
      let surgeX = 0;
      let leanDeg = 0;
      let cadenceBoost = 1;

      if (transitionStartRef.current !== null) {
        const elapsed = now - transitionStartRef.current;
        if (elapsed >= 820) {
          transitionStartRef.current = null;
        } else {
          // 0-150ms: companion glances back & reaches arm back; girl reaches right hand forward to clasp
          const reachIn = smoothstep(0, 145, elapsed);
          // 150-430ms: brisk hand-in-hand half-step pull while whip-pan streaks past
          const pullEnvelope =
            elapsed < 150
              ? 0
              : elapsed < 430
                ? smoothstep(150, 290, elapsed)
                : 1 - smoothstep(430, 740, elapsed);
          // 430-740ms: gentle release back to normal walkLoop
          const releaseOut = smoothstep(430, 720, elapsed);

          lookBack = reachIn * (1 - smoothstep(320, 640, elapsed));
          claspWeight = reachIn * (1 - releaseOut);
          surgeX = pullEnvelope * 7.5;
          leanDeg = pullEnvelope * 2.4;
          cadenceBoost = 1 + pullEnvelope * 0.68;
        }
      }

      // Continuous unhurried walkLoop (~5.4 rad/s -> natural calm pace; accelerates smoothly during pull)
      phaseRef.current = (phaseRef.current + dt * 5.6 * cadenceBoost) % (Math.PI * 2);

      const pG = phaseRef.current;
      // Companion walks slightly out-of-phase (+0.85 rad) so both strides feel alive & natural
      const pC = phaseRef.current + 0.85;

      const gFront = legCycle(pG, BASE_STAND.gFrontHip, BASE_STAND.gFrontKnee, 0.27);
      const gBack = legCycle(pG + Math.PI, BASE_STAND.gBackHip, BASE_STAND.gBackKnee, 0.27);

      const cFront = legCycle(pC, BASE_STAND.cFrontHip, BASE_STAND.cFrontKnee, 0.26);
      const cBack = legCycle(pC + Math.PI, BASE_STAND.cBackHip, BASE_STAND.cBackKnee, 0.26);

      // Normal walk arm swings
      const gLeftArmWalk = BASE_STAND.gLeftArm - Math.sin(pG) * 0.24;
      const gRightArmWalk = BASE_STAND.gRightArm - Math.sin(pG + Math.PI) * 0.22;

      const cLeftArmWalk = BASE_STAND.cLeftArm - Math.sin(pC) * 0.23;
      const cRightArmWalk = BASE_STAND.cRightArm - Math.sin(pC + Math.PI) * 0.23;

      // During 0-430ms transition beat: girl's right arm reaches forward (+0.52 rad), companion's left arm reaches back (-0.64 rad) to clasp!
      const gRightArm = lerp(gRightArmWalk, 0.56, claspWeight);
      const gRightForearm = lerp(0.15 + Math.max(0, -Math.sin(pG + Math.PI)) * 0.16, 0.34, claspWeight);

      const cLeftArm = lerp(cLeftArmWalk, -0.62, claspWeight);
      const cLeftForearm = lerp(0.14 + Math.max(0, -Math.sin(pC)) * 0.16, -0.18, claspWeight);

      // Flowing jade-teal áo dài panels (always swaying naturally to walkLoop + breeze on pull)
      const breezeBias = 1 + claspWeight * 0.65;
      const rearPanelSwing = (-5.8 + Math.sin(pG - 0.5) * 4.4) * breezeBias;
      const rearPanelBillow = (3.8 + Math.cos(pG * 2 - 0.4) * 2.5) * breezeBias;
      const frontPanelSwing = (3.2 + Math.sin(pG + 0.35) * 4.8) * breezeBias;

      setPose({
        gFrontHip: gFront.hip,
        gFrontKnee: gFront.knee,
        gFrontFootPitch: gFront.footPitch,
        gBackHip: gBack.hip,
        gBackKnee: gBack.knee,
        gBackFootPitch: gBack.footPitch,
        gLeftArm: gLeftArmWalk,
        gLeftForearm: 0.16 + Math.max(0, -Math.sin(pG)) * 0.18,
        gRightArm,
        gRightForearm,
        rearPanelSwing,
        rearPanelBillow,
        frontPanelSwing,
        hairSway: (-2.4 + Math.sin(pG - 0.6) * 2.1) * breezeBias,
        cFrontHip: cFront.hip,
        cFrontKnee: cFront.knee,
        cFrontFootPitch: cFront.footPitch,
        cBackHip: cBack.hip,
        cBackKnee: cBack.knee,
        cBackFootPitch: cBack.footPitch,
        cLeftArm,
        cLeftForearm,
        cRightArm: cRightArmWalk,
        cRightForearm: 0.18 + Math.max(0, -Math.sin(pC + Math.PI)) * 0.16,
        lookBack,
        claspWeight,
        surgeX,
        leanDeg,
        shadowRx: 30 + Math.abs(Math.sin(pG)) * 6,
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, reducedMotion]);

  // === COMPANION GEOMETRY (Half step ahead on right, slightly deeper ground plane y=276) ===
  const cX = 160 + pose.surgeX * 1.05;
  const cHipY = 158;
  const cBackLeg = computeLegPoints(cX + 6, cHipY, pose.cBackHip, pose.cBackKnee, 54, 55);
  const cFrontLeg = computeLegPoints(cX - 5, cHipY, pose.cFrontHip, pose.cFrontKnee, 54, 55);
  const cRightArm = computeArmPoints(cX + 11, 88, pose.cRightArm, pose.cRightForearm, 34, 30);
  const cLeftArm = computeArmPoints(cX - 11, 90, pose.cLeftArm, pose.cLeftForearm, 34, 30);

  // === GIRL IN JADE-TEAL ÁO DÀI (Left-rear of couple, slightly nearer ground plane y=280) ===
  const gX = 86 + pose.surgeX * 0.9;
  const gHipY = 166;
  const gBackLeg = computeLegPoints(gX + 6, gHipY, pose.gBackHip, pose.gBackKnee, 53, 53);
  const gFrontLeg = computeLegPoints(gX - 5, gHipY, pose.gFrontHip, pose.gFrontKnee, 53, 53);
  const gRightArm = computeArmPoints(gX + 10, 94, pose.gRightArm, pose.gRightForearm, 32, 29);
  const gLeftArm = computeArmPoints(gX - 12, 96, pose.gLeftArm, pose.gLeftForearm, 32, 29);

  // Shared hand-clasp bridge when hands meet during 0-430ms beat
  const claspMidX = (gRightArm.handX + cLeftArm.handX) / 2;
  const claspMidY = (gRightArm.handY + cLeftArm.handY) / 2;
  const gRightHandX = lerp(gRightArm.handX, claspMidX, pose.claspWeight);
  const gRightHandY = lerp(gRightArm.handY, claspMidY, pose.claspWeight);
  const cLeftHandX = lerp(cLeftArm.handX, claspMidX, pose.claspWeight);
  const cLeftHandY = lerp(cLeftArm.handY, claspMidY, pose.claspWeight);

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

  // Dynamic paths for BOTH long jade-teal áo dài panels (hai tà dài)
  const rpS = pose.rearPanelSwing;
  const rpB = pose.rearPanelBillow;
  const fpS = pose.frontPanelSwing;

  const frontTaPath = `
    M ${gX + 2} 131
    L ${gX + 15} 132
    Q ${(gX + 21 + fpS * 0.45).toFixed(1)} 180 ${(gX + 26 + fpS).toFixed(1)} 234
    Q ${(gX + 16 + fpS * 0.85).toFixed(1)} 238 ${(gX + 6 + fpS * 0.65).toFixed(1)} 235
    Q ${(gX + 4 + fpS * 0.3).toFixed(1)} 182 ${gX + 2} 131 Z
  `;

  const rearTaPath = `
    M ${gX - 15} 130
    Q ${gX - 6} 131 ${gX + 1} 132
    Q ${(gX - 1 + rpS * 0.45 + rpB * 0.3).toFixed(1)} 184 ${(gX - 4 + rpS + rpB * 0.45).toFixed(1)} 241
    Q ${(gX - 17 + rpS * 0.9).toFixed(1)} 245 ${(gX - 32 + rpS * 1.15 - rpB * 0.35).toFixed(1)} 238
    Q ${(gX - 24 + rpS * 0.55 - rpB * 0.15).toFixed(1)} 186 ${gX - 15} 130 Z
  `;

  const rearTaSheenPath = `
    M ${gX - 6} 132
    L ${gX + 1} 132
    Q ${(gX - 1 + rpS * 0.45 + rpB * 0.3).toFixed(1)} 184 ${(gX - 4 + rpS + rpB * 0.45).toFixed(1)} 241
    Q ${(gX - 8 + rpS * 0.95).toFixed(1)} 243 ${(gX - 13 + rpS * 0.9).toFixed(1)} 242
    Q ${(gX - 8 + rpS * 0.45).toFixed(1)} 186 ${gX - 6} 132 Z
  `;

  // Companion gentle look-back rotation anchored at neck base
  const compHeadDeg = -(pose.lookBack * 15);

  return (
    <svg
      className="traveler-svg"
      viewBox="0 0 256 296"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Cặp đôi du khách đi bộ dọc hành trình Đà Nẵng – Huế, cô gái mặc áo dài xanh ngọc đeo ba lô kem đi sau nửa bước"
      role="img"
    >
      <defs>
        <radialGradient id="coupleGroundShadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#14231C" stopOpacity="0.33" />
          <stop offset="65%" stopColor="#14231C" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#14231C" stopOpacity="0" />
        </radialGradient>

        {/* Jade-teal silk áo dài */}
        <linearGradient id="jadeSilkMain" x1="0%" y1="0%" x2="100%" y2="85%">
          <stop offset="0%" stopColor="#1B7C70" />
          <stop offset="52%" stopColor="#269B8C" />
          <stop offset="100%" stopColor="#3BB3A2" />
        </linearGradient>
        <linearGradient id="jadeSilkRearTa" x1="15%" y1="0%" x2="90%" y2="95%">
          <stop offset="0%" stopColor="#1E877A" />
          <stop offset="58%" stopColor="#289F90" />
          <stop offset="100%" stopColor="#35AD9D" />
        </linearGradient>
        <linearGradient id="jadeSilkFrontTa" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#269A8B" />
          <stop offset="100%" stopColor="#48BEB0" />
        </linearGradient>

        {/* Light ivory silk trousers */}
        <linearGradient id="ivoryTrouserFront" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#EAE3D3" />
          <stop offset="45%" stopColor="#F8F4EA" />
          <stop offset="100%" stopColor="#FFFDF8" />
        </linearGradient>
        <linearGradient id="ivoryTrouserBack" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D6CEBC" />
          <stop offset="100%" stopColor="#EAE3D4" />
        </linearGradient>

        {/* Cream canvas backpack */}
        <linearGradient id="creamCanvasPack" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EFE8D7" />
          <stop offset="65%" stopColor="#E4DAC4" />
          <stop offset="100%" stopColor="#D2C5AA" />
        </linearGradient>

        {/* Companion olive-linen shirt & warm stone trousers */}
        <linearGradient id="companionShirt" x1="0%" y1="0%" x2="100%" y2="90%">
          <stop offset="0%" stopColor="#3C5B49" />
          <stop offset="60%" stopColor="#4B6E59" />
          <stop offset="100%" stopColor="#60846E" />
        </linearGradient>
      </defs>

      {/* === GROUND CONTACT SHADOWS (both feet grounded, zero float) === */}
      <ellipse cx={cX} cy="276" rx={pose.shadowRx + 2} ry="6.5" fill="url(#coupleGroundShadow)" />
      <ellipse cx={gX - 2} cy="280.5" rx={pose.shadowRx} ry="6.8" fill="url(#coupleGroundShadow)" />

      {/* ========================================================================
          CHARACTER 2 (FRONT-RIGHT, HALF STEP AHEAD): COMPANION
      ======================================================================== */}
      <g transform={`rotate(${(pose.leanDeg * 0.85).toFixed(2)} ${cX} 274)`}>
        {/* Farther right arm */}
        <g>
          <line
            x1={cX + 11}
            y1="88"
            x2={cRightArm.elbowX}
            y2={cRightArm.elbowY}
            stroke="#375443"
            strokeWidth="10.5"
            strokeLinecap="round"
          />
          <line
            x1={cRightArm.elbowX}
            y1={cRightArm.elbowY}
            x2={cRightArm.handX}
            y2={cRightArm.handY}
            stroke="#456653"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle cx={cRightArm.handX} cy={cRightArm.handY} r="4.2" fill="#D5A683" />
        </g>

        {/* Companion legs & light warm-stone chinos */}
        <g>
          {renderShoe(cBackLeg.ankleX, cBackLeg.ankleY, pose.cBackFootPitch, '#544133', '#2A2019')}
          <path d={buildTrouserPath(cX + 6, cHipY, cBackLeg, 9, 8.2, 7.6)} fill="#C7BEA9" />
        </g>
        <g>
          {renderShoe(cFrontLeg.ankleX, cFrontLeg.ankleY, pose.cFrontFootPitch, '#654F3E', '#2E231B')}
          <path d={buildTrouserPath(cX - 5, cHipY, cFrontLeg, 9.5, 8.6, 8)} fill="#DFD7C4" />
        </g>

        {/* Companion torso (3/4 rear view facing right, linen travel shirt + small crossbody strap) */}
        <g>
          <path
            d={`M ${cX - 15} 78 Q ${cX + 1} 73 ${cX + 15} 80 L ${cX + 16} 118 Q ${cX + 13} 145 ${cX + 12} 161 L ${cX - 14} 160 Q ${cX - 15} 130 ${cX - 15} 78 Z`}
            fill="url(#companionShirt)"
          />
          {/* Sunlit right shoulder highlight */}
          <path
            d={`M ${cX + 8} 78 L ${cX + 15} 81 L ${cX + 16} 120 L ${cX + 12} 159 L ${cX + 6} 159 Z`}
            fill="#6C917A"
            fillOpacity="0.45"
          />
          {/* Collar */}
          <path d={`M ${cX - 9} 72 Q ${cX} 75 ${cX + 10} 72 L ${cX + 11} 80 Q ${cX} 83 ${cX - 10} 80 Z`} fill="#314C3C" />
          {/* Subtle tan crossbody strap across back */}
          <path
            d={`M ${cX + 8} 79 Q ${cX - 3} 108 ${cX - 14} 136 L ${cX - 14} 144 Q ${cX + 1} 112 ${cX + 13} 82 Z`}
            fill="#B78F64"
            fillOpacity="0.9"
          />
          {/* Compact tan sling pouch at lower-left hip */}
          <rect x={cX - 18} y="128" width="13" height="17" rx="4" fill="#9E764E" />
        </g>

        {/* Companion head — glances back-left slightly during 0-150ms! */}
        <g transform={`rotate(${compHeadDeg.toFixed(2)} ${cX} 72)`}>
          <path d={`M ${cX - 5} 62 L ${cX + 7} 62 L ${cX + 7} 74 Q ${cX + 1} 76 ${cX - 5} 74 Z`} fill="#D8AC8B" />
          {/* Subtle right/front profile sliver (widens softly on look-back toward left!) */}
          <path
            d={`M ${cX - 2 - pose.lookBack * 5} 39 Q ${cX + 13} 39 ${cX + 14} 50 L ${cX + 15.5} 54 Q ${cX + 15.5} 56 ${cX + 13} 57 L ${cX + 11} 64 Q ${cX + 4} 66 ${cX - 3 - pose.lookBack * 4} 64 Z`}
            fill="#E3BA99"
          />
          {/* Ear (shifts slightly on look-back) */}
          <ellipse cx={cX - 2 - pose.lookBack * 1.5} cy="52" rx="2.6" ry="3.8" fill="#D5A683" />
          {/* Companion short dark hair (3/4 rear) */}
          <path
            d={`M ${cX - 13} 49 Q ${cX - 14} 33 ${cX + 1} 32 Q ${cX + 14} 33 ${cX + 14} 45 Q ${cX + 10} 41 ${cX + 3} 43 Q ${cX - 1} 49 ${cX - 2} 60 L ${cX - 11} 60 Q ${cX - 13} 55 ${cX - 13} 49 Z`}
            fill="#231D19"
          />
        </g>

        {/* Companion nearer left arm (reaches back cleanly to clasp her right hand!) */}
        <g>
          <line
            x1={cX - 11}
            y1="90"
            x2={lerp(cLeftArm.elbowX, claspMidX + 10, pose.claspWeight * 0.45)}
            y2={lerp(cLeftArm.elbowY, claspMidY - 12, pose.claspWeight * 0.45)}
            stroke="#446552"
            strokeWidth="10.8"
            strokeLinecap="round"
          />
          <line
            x1={lerp(cLeftArm.elbowX, claspMidX + 10, pose.claspWeight * 0.45)}
            y1={lerp(cLeftArm.elbowY, claspMidY - 12, pose.claspWeight * 0.45)}
            x2={cLeftHandX}
            y2={cLeftHandY}
            stroke="#50745E"
            strokeWidth="9.2"
            strokeLinecap="round"
          />
          <circle cx={cLeftHandX} cy={cLeftHandY} r="4.4" fill="#E3BA99" />
        </g>
      </g>

      {/* ========================================================================
          CHARACTER 1 (REAR-LEFT, NEARER): GIRL IN JADE-TEAL ÁO DÀI
      ======================================================================== */}
      <g transform={`rotate(${pose.leanDeg.toFixed(2)} ${gX} 278)`}>
        {/* Farther right arm — reaches forward during 0-430ms to clasp his hand */}
        <g>
          <line
            x1={gX + 10}
            y1="94"
            x2={lerp(gRightArm.elbowX, claspMidX - 10, pose.claspWeight * 0.45)}
            y2={lerp(gRightArm.elbowY, claspMidY - 10, pose.claspWeight * 0.45)}
            stroke="#19756A"
            strokeWidth="9.8"
            strokeLinecap="round"
          />
          <line
            x1={lerp(gRightArm.elbowX, claspMidX - 10, pose.claspWeight * 0.45)}
            y1={lerp(gRightArm.elbowY, claspMidY - 10, pose.claspWeight * 0.45)}
            x2={gRightHandX}
            y2={gRightHandY}
            stroke="#249385"
            strokeWidth="8.4"
            strokeLinecap="round"
          />
          <circle cx={gRightHandX} cy={gRightHandY} r="4.2" fill="#E5BC9B" />
        </g>

        {/* Tà trước */}
        <path d={frontTaPath} fill="url(#jadeSilkFrontTa)" />

        {/* Farther leg & light ivory silk trouser */}
        <g>
          {renderShoe(gBackLeg.ankleX, gBackLeg.ankleY, pose.gBackFootPitch, '#DDD4C0', '#7D715E')}
          <path d={buildTrouserPath(gX + 6, gHipY, gBackLeg, 9.5, 10.5, 11.4)} fill="url(#ivoryTrouserBack)" />
        </g>

        {/* Nearer leg & light ivory silk trouser */}
        <g>
          {renderShoe(gFrontLeg.ankleX, gFrontLeg.ankleY, pose.gFrontFootPitch, '#F3ECE0', '#8E816C')}
          <path d={buildTrouserPath(gX - 5, gHipY, gFrontLeg, 10.4, 11.4, 12.6)} fill="url(#ivoryTrouserFront)" />
        </g>

        {/* High side-slit silk trouser peek at hip */}
        <path
          d={`M ${gX} 130 Q ${gX + 9} 133 ${gX + 11} 148 L ${gX + 3} 176 L ${gX - 7} 170 L ${gX - 4} 132 Z`}
          fill="#F4EFE3"
        />

        {/* Tà sau */}
        <g>
          <path d={rearTaPath} fill="url(#jadeSilkRearTa)" />
          <path d={rearTaSheenPath} fill="#46BFB0" fillOpacity="0.45" />
        </g>

        {/* Fitted áo dài upper bodice & high collar */}
        <g>
          <path
            d={`M ${gX - 15} 85 Q ${gX} 80 ${gX + 14} 87 L ${gX + 15} 106 Q ${gX + 11} 122 ${gX + 12} 133 L ${gX - 14} 131 Q ${gX - 12} 119 ${gX - 15} 104 Z`}
            fill="url(#jadeSilkMain)"
          />
          <path
            d={`M ${gX + 8} 85 L ${gX + 14} 88 L ${gX + 15} 107 Q ${gX + 12} 122 ${gX + 13} 133 L ${gX + 7} 132 Z`}
            fill="#47C1B2"
            fillOpacity="0.55"
          />
          {/* Mandarin standing collar */}
          <path
            d={`M ${gX - 9} 76 Q ${gX + 1} 74 ${gX + 9} 77 L ${gX + 10} 85 Q ${gX} 87 ${gX - 10} 85 Z`}
            fill="#1B7D72"
          />
        </g>

        {/* Head & low tied hair (3/4 rear view facing right) */}
        <g>
          <path d={`M ${gX - 7} 69 L ${gX + 6} 69 L ${gX + 6} 78 Q ${gX - 1} 80 ${gX - 7} 78 Z`} fill="#E3B997" />
          <path
            d={`M ${gX} 46 Q ${gX + 11} 46 ${gX + 12} 56 L ${gX + 13.5} 60 Q ${gX + 13.5} 62 ${gX + 11} 63 L ${gX + 9} 69 Q ${gX + 6} 71 ${gX - 1} 70 Z`}
            fill="#EFC7A7"
          />
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
        <g>
          <path
            d={`M ${gX - 20} 90 Q ${gX - 26} 94 ${gX - 25} 108 L ${gX - 23} 125 Q ${gX - 18} 129 ${gX - 6} 128 L ${gX - 2} 125 L ${gX - 4} 89 Z`}
            fill="#104E47"
            fillOpacity="0.22"
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
            y1="96"
            x2={gLeftArm.elbowX}
            y2={gLeftArm.elbowY}
            stroke="#228E81"
            strokeWidth="10.2"
            strokeLinecap="round"
          />
          <line
            x1={gLeftArm.elbowX}
            y1={gLeftArm.elbowY}
            x2={gLeftArm.handX}
            y2={gLeftArm.handY}
            stroke="#299E8F"
            strokeWidth="8.6"
            strokeLinecap="round"
          />
          <circle cx={gLeftArm.handX} cy={gLeftArm.handY} r="4.3" fill="#EBC2A1" />
        </g>
      </g>
    </svg>
  );
};
