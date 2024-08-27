import { Route, Routes } from "react-router-dom";

import VideoTesterView from "@/pages/developer/VideoTesterView";
import { NotFoundPage } from "@/pages/errors/NotFoundPage";
import PlayerView from "@/pages/PlayerView";
import { Layout } from "@/setup/Layout";

const embedPaths = [
  "/embed/:type/:id",
  "/embed/:type/:id/:season",
  "/embed/:type/:id/:season/:episode",
];

function App() {
  return (
    <Layout>
      <Routes>
        {/* pages */}
        {embedPaths.map((path) => (
          <Route path={path} key={path} element={<PlayerView />} />
        ))}
        {/* other */}
        <Route path="/dev/video" element={<VideoTesterView />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
