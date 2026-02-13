import { useMemo, type CSSProperties } from 'react';

export interface StarfieldProps {
  starCount?: number;
  style?: CSSProperties;
}

interface StarData {
  left: number;
  top: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
}

function generateStars(count: number): StarData[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.7 + 0.3,
    duration: Math.random() * 2 + 2,   // 2–4s cycle
    delay: Math.random() * -4,          // stagger start
  }));
}

export function Starfield({
  starCount = 180,
  style = {},
}: StarfieldProps) {
  const stars = useMemo(() => generateStars(starCount), [starCount]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        ...style,
      }}
    >
      {stars.map((star, i) => (
        <div
          key={i}
          className="starfield-star"
          style={{
            position: 'absolute',
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            borderRadius: '50%',
            background: 'white',
            opacity: star.opacity,
            filter: 'blur(0.5px)',
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
