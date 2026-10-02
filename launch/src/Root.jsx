import { Composition } from "remotion";
import { LaunchVideo, durationOf, FPS } from "./LaunchVideo";

const SIZES = { "16:9": [1920, 1080] };

export const Root = () => (
  <Composition
    id="Launch"
    component={LaunchVideo}
    fps={FPS}
    width={1920}
    height={1080}
    durationInFrames={FPS * 10}
    defaultProps={{ board: { brand: { name: "Preview", domain: "example.com" }, scenes: [{ type: "hook", headline: "Your board goes here.", seconds: 3 }] } }}
    calculateMetadata={({ props }) => {
      const [width, height] = SIZES[props.board?.aspect] || SIZES["16:9"];
      return { durationInFrames: durationOf(props.board), width, height };
    }}
  />
);
