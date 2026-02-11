import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react';
import { memo } from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * Custom edge component that differentiates between normal and cycle (back) edges.
 * Cycle edges use dashed lines with a rotation icon.
 */
function CycleEdgeComponent({
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, data, selected, style = {},
}: any) {
    const isCycle = data?.back_edge === true;

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX, sourceY, targetX, targetY,
        sourcePosition, targetPosition,
        curvature: isCycle ? 0.8 : 0.25,
    });

    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                style={{
                    ...style,
                    stroke: isCycle ? '#d946ef' : selected ? '#3b82f6' : '#94a3b8',
                    strokeWidth: selected ? 2.5 : 1.5,
                    strokeDasharray: isCycle ? '8 4' : undefined,
                }}
            />
            {isCycle && (
                <EdgeLabelRenderer>
                    <div
                        className="absolute pointer-events-none flex items-center justify-center"
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                        }}
                    >
                        <div className="bg-purple-100 border border-purple-300 rounded-full p-1">
                            <RotateCcw className="w-3 h-3 text-purple-500" />
                        </div>
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

export default memo(CycleEdgeComponent);
