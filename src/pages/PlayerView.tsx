import { RunOutput } from "@movie-web/providers";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { usePlayer } from "@/components/player/hooks/usePlayer";
import { usePlayerMeta } from "@/components/player/hooks/usePlayerMeta";
import { convertProviderCaption } from "@/components/player/utils/captions";
import { convertRunoutputToSource } from "@/components/player/utils/convertRunoutputToSource";
import { ScrapingItems, ScrapingSegment } from "@/hooks/useProviderScrape";
import { useQueryParam } from "@/hooks/useQueryParams";
import { MetaPart } from "@/pages/parts/player/MetaPart";
import { PlaybackErrorPart } from "@/pages/parts/player/PlaybackErrorPart";
import { PlayerPart } from "@/pages/parts/player/PlayerPart";
import { ScrapeErrorPart } from "@/pages/parts/player/ScrapeErrorPart";
import { ScrapingPart } from "@/pages/parts/player/ScrapingPart";
import { useLastNonPlayerLink } from "@/stores/history";
import { PlayerMeta, playerStatus } from "@/stores/player/slices/source";
import { parseTimestamp } from "@/utils/timestamp";

export function RealPlayerView() {
  const navigate = useNavigate();
  const params = useParams<{
    id: string;
    type: string;
    season?: string;
    episode?: string;
  }>();
  const [errorData, setErrorData] = useState<{
    sources: Record<string, ScrapingSegment>;
    sourceOrder: ScrapingItems[];
  } | null>(null);
  const [startAtParam] = useQueryParam("t");
  const {
    status,
    playMedia,
    reset,
    setScrapeNotFound,
    shouldStartFromBeginning,
    setShouldStartFromBeginning,
  } = usePlayer();
  const { setPlayerMeta, scrapeMedia } = usePlayerMeta();
  const backUrl = useLastNonPlayerLink();

  const paramsData = JSON.stringify({
    id: params.id,
    type: params.type,
    season: params.season,
    episode: params.episode,
  });
  useEffect(() => {
    reset();
  }, [paramsData, reset]);

  const metaChange = useCallback(
    (meta: PlayerMeta) => {
      const { id, type } = params;
      if (meta?.type === "show") {
        const path: string = `/embed/${type}/${id}`;
        navigate(`${path}/${meta.season?.number}/${meta.episode?.number}`);
      } else {
        navigate(`/embed/${type}/${id}`);
      }
    },
    [navigate, params],
  );

  const playAfterScrape = useCallback(
    (out: RunOutput | null) => {
      if (!out) return;

      let startAt: number | undefined;
      if (startAtParam) startAt = parseTimestamp(startAtParam) ?? undefined;

      playMedia(
        convertRunoutputToSource(out),
        convertProviderCaption(out.stream.captions),
        out.sourceId,
        shouldStartFromBeginning ? 0 : startAt,
      );
      setShouldStartFromBeginning(false);
    },
    [
      playMedia,
      startAtParam,
      shouldStartFromBeginning,
      setShouldStartFromBeginning,
    ],
  );

  return (
    <PlayerPart backUrl={backUrl} onMetaChange={metaChange}>
      {status === playerStatus.IDLE ? (
        <MetaPart onGetMeta={setPlayerMeta} />
      ) : null}
      {status === playerStatus.SCRAPING && scrapeMedia ? (
        <ScrapingPart
          media={scrapeMedia}
          onResult={(sources, sourceOrder) => {
            setErrorData({
              sourceOrder,
              sources,
            });
            setScrapeNotFound();
          }}
          onGetStream={playAfterScrape}
        />
      ) : null}
      {status === playerStatus.SCRAPE_NOT_FOUND && errorData ? (
        <ScrapeErrorPart data={errorData} />
      ) : null}
      {status === playerStatus.PLAYBACK_ERROR ? <PlaybackErrorPart /> : null}
    </PlayerPart>
  );
}

export function PlayerView() {
  return <RealPlayerView />;
}

export default PlayerView;
