import BackgroundPreview from "./BackgroundPreview";
import GoldenHourCalculator from "../GoldenHourCalculator";

export const metadata = {
  title: "Background previews | Photo Planning",
};

export default function BackgroundPreviewPage() {
  return (
    <BackgroundPreview>
      <GoldenHourCalculator />
    </BackgroundPreview>
  );
}
