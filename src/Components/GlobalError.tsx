import React from 'react';
import { useNavigate } from 'react-router-dom';

const GlobalError: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#efefef] font-poppins min-h-screen">
            <div className="bg-[#f5f5f5] rounded-3xl shadow-lg w-full max-w-2xl border border-gray-100 flex flex-row items-center px-12 py-14 gap-4">

                {/* LEFT - Text */}
                <div className="flex flex-col items-start text-left" style={{ flex: '0 0 45%' }}>
                    <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 900, fontSize: '1.9rem', letterSpacing: '-0.5px' }} className="text-gray-800 mb-3">Oh snap!</h1>
                    <p className="text-gray-400 text-xs mb-8 leading-relaxed">
                        Something went wrong with this page.<br />
                        You can watch this tiny berry bumping<br />
                        over and over again or go back home<br />
                        and take it from scratch.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-500 text-xs font-medium hover:bg-gray-50 transition-all shadow-sm"
                    >
                        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3L4 6.5l4 3.5M4 6.5h9" /></svg>
                        Back to Home
                    </button>
                </div>

                {/* RIGHT - Animation */}
                <div style={{ flex: '0 0 55%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', minHeight: 200 }}>
                    <div style={{ position: 'relative', width: 290, height: 185 }}>

                        {/* 
                            Floor line: starts at base of door (center-bottom of door)
                            and goes diagonally to the right edge — like reference 
                        -->
                        Door base is at x=108, y=158 (bottom center of door)
                        Line goes from there to right edge
                        */}
                        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 290 185" fill="none">
                            {/* Main floor line — from door base going right diagonally */}
                            <line x1="108" y1="158" x2="290" y2="138" stroke="#c5c5c5" strokeWidth="1" />
                            {/* Faint secondary line */}
                            <line x1="108" y1="162" x2="290" y2="150" stroke="#c5c5c5" strokeWidth="0.6" opacity="0.4" />
                        </svg>

                        {/* Door shadow on floor */}
                        <div style={{
                            position: 'absolute', bottom: 22, left: 88,
                            width: 60, height: 10,
                            background: 'radial-gradient(ellipse, rgba(0,0,0,0.09) 50%, transparent 100%)',
                            borderRadius: '50%',
                        }} />

                        {/* DOOR — sits on the line, slightly less wide */}
                        <svg style={{ position: 'absolute', left: 78, bottom: 27 }}
                            width="72" height="112" viewBox="0 0 72 112" fill="none">
                            <path d="M3 112 L3 46 Q3 3 36 3 Q69 3 69 46 L69 112 Z" fill="#2a2a38" />
                            <path d="M9 112 L9 48 Q9 15 36 15 Q63 15 63 48 L63 112 Z" fill="#1e1e2c" />
                        </svg>

                        {/* Berry floor shadow */}
                        <div className="berry-shadow" style={{
                            position: 'absolute', bottom: 20, left: 0,
                            width: 50, height: 10,
                            background: 'radial-gradient(ellipse, rgba(0,0,0,0.13) 50%, transparent 100%)',
                            borderRadius: '50%',
                        }} />

                        {/* BERRY — longer legs */}
                        <div className="berry-wrap" style={{ position: 'absolute', bottom: 28, left: -4 }}>
                            <svg width="66" height="100" viewBox="0 0 66 100" fill="none">
                                {/* longer thin legs */}
                                <line className="leg leg1" x1="20" y1="72" x2="13" y2="98" stroke="#6055d8" strokeWidth="3" strokeLinecap="round" />
                                <line className="leg leg2" x1="33" y1="74" x2="33" y2="100" stroke="#6055d8" strokeWidth="3" strokeLinecap="round" />
                                <line className="leg leg3" x1="46" y1="72" x2="53" y2="98" stroke="#6055d8" strokeWidth="3" strokeLinecap="round" />
                                {/* body */}
                                <ellipse className="berry-body" cx="33" cy="46" rx="26" ry="26" fill="#ff3558" />
                                {/* highlight */}
                                <ellipse cx="23" cy="34" rx="9" ry="7" fill="#ff6878" opacity="0.32" />
                                {/* crown */}
                                <path d="M33 22 L37 33 L29 33 Z" fill="#6055d8" />
                                <circle cx="33" cy="21" r="3" fill="#6055d8" />
                                {/* eyes */}
                                <circle cx="25" cy="43" r="4.5" fill="white" />
                                <circle cx="41" cy="43" r="4.5" fill="white" />
                                <circle className="pupil lp" cx="26.5" cy="44.5" r="2.6" fill="#111126" />
                                <circle className="pupil rp" cx="42.5" cy="44.5" r="2.6" fill="#111126" />
                                {/* dizzy stars */}
                                <text className="star s1" x="46" y="24" fontSize="12" fill="#FFCC00">★</text>
                                <text className="star s2" x="6"  y="20" fontSize="10" fill="#FFCC00">★</text>
                                <text className="star s3" x="29" y="12" fontSize="11" fill="#FFCC00">★</text>
                            </svg>
                        </div>

                        <style>{`
                            .berry-wrap {
                                animation: bseq 4s ease-in-out infinite;
                            }
                            @keyframes bseq {
                                0%   { transform: translateX(0px)   translateY(0px)  rotate(0deg) scaleX(1); }
                                4%   { transform: translateX(0px)   translateY(0px)  rotate(0deg) scaleX(1); }
                                10%  { transform: translateX(28px)  translateY(-6px) rotate(0deg) scaleX(1); }
                                20%  { transform: translateX(60px)  translateY(-6px) rotate(0deg) scaleX(1); }
                                27%  { transform: translateX(90px)  translateY(0px)  rotate(0deg) scaleX(1); }
                                31%  { transform: translateX(106px) translateY(0px)  rotate(0deg) scaleX(1.4); }
                                34%  { transform: translateX(98px)  translateY(0px)  rotate(6deg) scaleX(0.85); }
                                41%  { transform: translateX(95px)  translateY(14px) rotate(9deg) scaleX(1); }
                                49%  { transform: translateX(93px)  translateY(26px) rotate(13deg) scaleX(1); }
                                54%  { transform: translateX(92px)  translateY(28px) rotate(11deg) scaleX(1); }
                                59%  { transform: translateX(92px)  translateY(28px) rotate(-7deg) scaleX(1); }
                                64%  { transform: translateX(92px)  translateY(28px) rotate(7deg)  scaleX(1); }
                                70%  { transform: translateX(92px)  translateY(14px) rotate(0deg) scaleX(1); }
                                75%  { transform: translateX(92px)  translateY(0px)  rotate(0deg) scaleX(-1); }
                                83%  { transform: translateX(58px)  translateY(-5px) rotate(0deg) scaleX(-1); }
                                93%  { transform: translateX(18px)  translateY(-5px) rotate(0deg) scaleX(-1); }
                                100% { transform: translateX(0px)   translateY(0px)  rotate(0deg) scaleX(1); }
                            }

                            .berry-body {
                                transform-origin: 33px 46px;
                                animation: bsquash 4s ease-in-out infinite;
                            }
                            @keyframes bsquash {
                                0%,26%,74%,100% { transform: scale(1,1); }
                                31% { transform: scale(1.55, 0.62); }
                                37% { transform: scale(0.78, 1.28); }
                                43% { transform: scale(1.06, 0.96); }
                                50% { transform: scale(1,1); }
                            }

                            .leg {
                                animation: lwalk 4s linear infinite;
                            }
                            .leg1 { animation-delay: 0s; }
                            .leg2 { animation-delay: 0.14s; }
                            .leg3 { animation-delay: 0.28s; }
                            @keyframes lwalk {
                                0%,3%   { transform: rotate(0deg); }
                                8%      { transform: rotate(-16deg); }
                                14%     { transform: rotate(16deg); }
                                20%     { transform: rotate(-16deg); }
                                26%     { transform: rotate(16deg); }
                                31%     { transform: rotate(32deg); }
                                35%     { transform: rotate(-32deg); }
                                40%,67% { transform: rotate(20deg); }
                                73%     { transform: rotate(0deg); }
                                79%     { transform: rotate(-16deg); }
                                85%     { transform: rotate(16deg); }
                                91%     { transform: rotate(-16deg); }
                                97%     { transform: rotate(16deg); }
                                100%    { transform: rotate(0deg); }
                            }

                            .star {
                                opacity: 0;
                                animation: sshow 4s ease-in-out infinite;
                            }
                            .s1 { animation-delay: 0s; }
                            .s2 { animation-delay: 0.13s; }
                            .s3 { animation-delay: 0.26s; }
                            @keyframes sshow {
                                0%,28%,64%,100% { opacity: 0; transform: scale(0) rotate(0deg); }
                                33% { opacity: 1; transform: scale(1.3) rotate(-22deg); }
                                42% { opacity: 1; transform: scale(1) rotate(22deg); }
                                54% { opacity: 0.4; }
                                60% { opacity: 0; }
                            }

                            .pupil {
                                animation: pseq 4s ease-in-out infinite;
                            }
                            .lp { animation-delay: 0s; }
                            .rp { animation-delay: 0.08s; }
                            @keyframes pseq {
                                0%,3%    { transform: translate(0px, 0px);  }
                                4%,27%   { transform: translate(2px, 0px);  }
                                33%      { transform: translate(-5px,-3px); }
                                41%      { transform: translate(4px,-3px);  }
                                49%      { transform: translate(-3px, 2px); }
                                56%      { transform: translate(0px, 2px);  }
                                61%      { transform: translate(-5px, 0px); }
                                66%      { transform: translate(5px, 0px);  }
                                75%,100% { transform: translate(-2px, 0px); }
                            }

                            .berry-shadow {
                                animation: smove 4s ease-in-out infinite;
                            }
                            @keyframes smove {
                                0%,4% { transform: translateX(0px)   scaleX(1);   opacity: 0.8; }
                                27%   { transform: translateX(90px)  scaleX(1);   opacity: 0.8; }
                                31%   { transform: translateX(106px) scaleX(1.8); opacity: 1;   }
                                49%   { transform: translateX(92px)  scaleX(0.5); opacity: 0.4; }
                                66%   { transform: translateX(92px)  scaleX(0.7); opacity: 0.6; }
                                75%   { transform: translateX(92px)  scaleX(1);   opacity: 0.8; }
                                100%  { transform: translateX(0px)   scaleX(1);   opacity: 0.8; }
                            }
                        `}</style>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalError;