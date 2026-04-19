export type MarkerKind = 'start' | 'end' | 'waypoint';

const GRADIENTS: Record<MarkerKind, string> = {
    start:    'radial-gradient(circle at 30% 30%, #22c55e, #15803d)',
    end:      'radial-gradient(circle at 30% 30%, #ef4444, #991b1b)',
    waypoint: 'radial-gradient(circle at 30% 30%, #60a5fa, #1d4ed8)',
};

export function markerHtml(kind: MarkerKind, label: string, size: number): string {
    return `
        <div style="
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: ${GRADIENTS[kind]};
            color: #fff;
            font-weight: 800;
            font-size: ${Math.round(size * 0.38)}px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 0 3px rgba(255,255,255,0.9), 0 4px 10px rgba(0,0,0,0.4);
            border: 2px solid rgba(0,0,0,0.2);
            box-sizing: border-box;
        ">${label}</div>
    `.trim();
}
