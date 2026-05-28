import { BaseEdge, type EdgeProps, type EdgeTypes } from "@xyflow/react";

type LoopEdgeData = {
  laneOffset?: number;
  loopLane?: number;
};

export const reviewEdgeTypes: EdgeTypes = {
  childGraphLink: ChildGraphLinkEdge,
  forwardOffset: ForwardOffsetEdge,
  loopBack: LoopBackEdge,
};

function ForwardOffsetEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  label,
  data,
  style,
  interactionWidth,
}: EdgeProps & { data: LoopEdgeData }) {
  const laneOffset = data.laneOffset ?? 0;
  const controlOffset = Math.max(80, Math.min(180, Math.abs(targetX - sourceX) * 0.34));
  const edgePath = `M ${sourceX},${sourceY} C ${sourceX + controlOffset},${sourceY + laneOffset} ${targetX - controlOffset},${targetY + laneOffset} ${targetX},${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2 + laneOffset - 10;

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      labelX={labelX}
      labelY={labelY}
      label={label}
      labelShowBg
      labelBgPadding={[5, 3]}
      labelBgBorderRadius={4}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}

function ChildGraphLinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  label,
  data,
  style,
  interactionWidth,
}: EdgeProps & { data: LoopEdgeData }) {
  const laneOffset = data.laneOffset ?? 0;
  const midY = (sourceY + targetY) / 2 + laneOffset;
  const exitX = sourceX + 82;
  const entryX = targetX - 70;
  const edgePath = `M ${sourceX},${sourceY} C ${exitX},${sourceY} ${exitX},${midY} ${exitX},${midY} L ${entryX},${midY} C ${entryX},${targetY} ${targetX},${targetY} ${targetX},${targetY}`;
  const labelX = (exitX + entryX) / 2;
  const labelY = midY - 10;

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      labelX={labelX}
      labelY={labelY}
      label={label}
      labelShowBg
      labelBgPadding={[5, 3]}
      labelBgBorderRadius={4}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}

function LoopBackEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  label,
  data,
  style,
  interactionWidth,
}: EdgeProps & { data: LoopEdgeData }) {
  const lane = data.loopLane ?? 0;
  const arcY = Math.min(sourceY, targetY) - 72 - lane * 34;
  const controlOffset = Math.max(80, Math.min(180, Math.abs(sourceX - targetX) * 0.28));
  const edgePath = `M ${sourceX},${sourceY} C ${sourceX + controlOffset},${arcY} ${targetX - controlOffset},${arcY} ${targetX},${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = arcY - 10;

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      labelX={labelX}
      labelY={labelY}
      label={label}
      labelShowBg
      labelBgPadding={[5, 3]}
      labelBgBorderRadius={4}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}
