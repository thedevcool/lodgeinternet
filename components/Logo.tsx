import React from "react";

interface LogoProps {
  className?: string;
  variant?: "light" | "dark";
}

const Logo: React.FC<LogoProps> = ({ className = "", variant = "dark" }) => {
  const textColor = variant === "light" ? "#ffffff" : "#1a2e4a";
  const accentColor = "#1e9be0";

  return (
    <svg
      viewBox="0 0 220 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className || "h-10 w-auto"}
    >
      {/* WiFi arcs above house */}
      <path
        d="M30 6 Q30 2 34 2 Q46 2 46 6"
        stroke={accentColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M27 10 Q27 4 34 4 Q49 4 49 10"
        stroke={accentColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M24 14 Q24 5 34 5 Q52 5 52 14"
        stroke={accentColor}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* House shape */}
      <polygon points="22,28 38,16 54,28" fill={textColor} />
      <rect x="26" y="28" width="24" height="16" fill={textColor} />
      {/* Door */}
      <rect x="33" y="36" width="10" height="8" rx="1" fill={accentColor} />
      {/* Door knob */}
      <circle cx="41" cy="40" r="1" fill="white" />

      {/* Water waves below house */}
      <path
        d="M20 46 Q26 43 32 46 Q38 49 44 46 Q50 43 56 46"
        stroke={accentColor}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M22 50 Q28 47 34 50 Q40 53 46 50 Q52 47 56 50"
        stroke={accentColor}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />

      {/* LODGE text */}
      <text
        x="68"
        y="34"
        fill={textColor}
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        fontSize="22"
        fontWeight="800"
        letterSpacing="1"
      >
        LODGE
      </text>

      {/* INTERNET text */}
      <text
        x="68"
        y="50"
        fill={accentColor}
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
        fontSize="14"
        fontWeight="700"
        letterSpacing="2"
      >
        INTERNET
      </text>
    </svg>
  );
};

export default Logo;
