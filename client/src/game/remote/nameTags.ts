// Name tags over other bears are plain page elements (in <NameTags>, outside the 3D canvas), moved
// every frame by RemoteBears to sit over each bear's head. (drei's <Html> tags crashed React 19
// when a bear appeared mid-render.)
export const nameTagEls = new Map<string, HTMLDivElement>();
