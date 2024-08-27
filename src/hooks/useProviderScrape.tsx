/* eslint-disable no-plusplus */
import {
  FullScraperEvents,
  RunOutput,
  Stream,
  flags,
} from "@movie-web/providers";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";

import { isExtensionActiveCached } from "@/backend/extension/messaging";
import { prepareStream } from "@/backend/extension/streams";
import {
  connectServerSideEvents,
  getCachedMetadata,
  makeProviderUrl,
} from "@/backend/helpers/providerApi";
import {
  MWScrapeMedia,
  ServerModel,
  SourceModel,
  SubtitleModel,
} from "@/backend/metadata/types/mw";
import { getSources } from "@/backend/metadata/vidsrc";
import { getLoadbalancedProviderApiUrl } from "@/backend/providers/fetchers";
import { getProviders } from "@/backend/providers/providers";
import { usePreferencesStore } from "@/stores/preferences";
import { labelToLanguageCode } from "@/utils/language";

export interface ScrapingItems {
  id: string;
  children: string[];
}

export interface ScrapingSegment {
  name: string;
  id: string;
  embedId?: string;
  status: "failure" | "pending" | "notfound" | "success" | "waiting";
  reason?: string;
  error?: any;
  percentage: number;
}

type ScraperEvent<Event extends keyof FullScraperEvents> = Parameters<
  NonNullable<FullScraperEvents[Event]>
>[0];

function useBaseScrape() {
  const [sources, setSources] = useState<Record<string, ScrapingSegment>>({});
  const [sourceOrder, setSourceOrder] = useState<ScrapingItems[]>([]);
  const [currentSource, setCurrentSource] = useState<string>();
  const lastId = useRef<string | null>(null);

  const initSourceOrder = useCallback((servers: ServerModel[]) => {
    setSources(
      servers
        .map((server: ServerModel) => {
          return {
            percentage: 40,
            id: server.hash,
            name: server.name,
            status: "waiting",
          } as ScrapingSegment;
        })
        .reduce<Record<string, ScrapingSegment>>(
          (accumulator, currentValue) => {
            accumulator[currentValue.id] = currentValue;
            return accumulator;
          },
          {},
        ),
    );
    setSourceOrder(
      servers.map((server: ServerModel) => ({ id: server.hash, children: [] })),
    );
  }, []);

  const initEvent = useCallback((evt: ScraperEvent<"init">) => {
    setSources(
      evt.sourceIds
        .map((v) => {
          const source = getCachedMetadata().find((s) => s.id === v);
          if (!source) throw new Error("invalid source id");
          const out: ScrapingSegment = {
            name: source.name,
            id: source.id,
            status: "waiting",
            percentage: 0,
          };
          return out;
        })
        .reduce<Record<string, ScrapingSegment>>((a, v) => {
          a[v.id] = v;
          return a;
        }, {}),
    );
    setSourceOrder(evt.sourceIds.map((v) => ({ id: v, children: [] })));
  }, []);

  const startEvent = useCallback((id: ScraperEvent<"start">) => {
    const lastIdTmp = lastId.current;
    setSources((s) => {
      if (s[id]) s[id].status = "pending";
      if (lastIdTmp && s[lastIdTmp] && s[lastIdTmp].status === "pending")
        s[lastIdTmp].status = "success";
      return { ...s };
    });
    setCurrentSource(id);
    lastId.current = id;
  }, []);

  const updateEvent = useCallback((evt: ScraperEvent<"update">) => {
    setSources((s) => {
      if (s[evt.id]) {
        s[evt.id].status = evt.status;
        s[evt.id].reason = evt.reason;
        s[evt.id].error = evt.error;
        s[evt.id].percentage = evt.percentage;
      }
      return { ...s };
    });
  }, []);

  const discoverEmbedsEvent = useCallback(
    (evt: ScraperEvent<"discoverEmbeds">) => {
      setSources((s) => {
        evt.embeds.forEach((v) => {
          const source = getCachedMetadata().find(
            (src) => src.id === v.embedScraperId,
          );
          if (!source) throw new Error("invalid source id");
          const out: ScrapingSegment = {
            embedId: v.embedScraperId,
            name: source.name,
            id: v.id,
            status: "waiting",
            percentage: 0,
          };
          s[v.id] = out;
        });
        return { ...s };
      });
      setSourceOrder((s) => {
        const source = s.find((v) => v.id === evt.sourceId);
        if (!source) throw new Error("invalid source id");
        source.children = evt.embeds.map((v) => v.id);
        return [...s];
      });
    },
    [],
  );

  const startScrape = useCallback(() => {
    lastId.current = null;
  }, []);

  const getResult = useCallback((output: RunOutput | null) => {
    if (output && lastId.current) {
      setSources((s) => {
        if (!lastId.current) return s;
        if (s[lastId.current]) s[lastId.current].status = "success";
        return { ...s };
      });
    }
    return output;
  }, []);

  return {
    initEvent,
    startEvent,
    updateEvent,
    discoverEmbedsEvent,
    startScrape,
    getResult,
    initSourceOrder,
    sources,
    sourceOrder,
    currentSource,
  };
}

export function useScrape() {
  const {
    sources,
    sourceOrder,
    currentSource,
    updateEvent,
    discoverEmbedsEvent,
    initEvent,
    getResult,
    startEvent,
    startScrape,
    initSourceOrder,
  } = useBaseScrape();

  const preferredSourceOrder = usePreferencesStore((s) => s.sourceOrder);

  const startScrapingSource = useCallback(
    async (media: MWScrapeMedia) => {
      if (!media.servers?.length) {
        return getResult(null);
      }
      startScrape();
      initSourceOrder(media.servers);
      let result: RunOutput | null = null;
      for (let i = 0; i < media.servers.length; i++) {
        startEvent(media.servers[i].hash);
        const server: ServerModel = media.servers[i];
        try {
          const response: SourceModel = await getSources(server.hash);
          if (response.source.length) {
            const stream: Stream = {
              type: "hls",
              id: server.hash,
              playlist: response.source,
              flags: [flags.CORS_ALLOWED],
              captions: response.subtitles?.length
                ? response.subtitles.map((subtitle: SubtitleModel) => {
                    return {
                      id: subtitle.file,
                      url: subtitle.file,
                      type: subtitle.type || "vtt",
                      language: subtitle.languageCode
                        ? subtitle.languageCode
                        : labelToLanguageCode(subtitle.label) || subtitle.label,
                      hasCorsRestrictions: false,
                    };
                  })
                : [],
            };
            result = {
              stream,
              sourceId: server.hash,
            } as RunOutput;
            break;
          } else {
            const failure: ScraperEvent<"update"> = {
              id: server.hash,
              status: "failure",
              error: "source not found",
              reason: "Failed to fetch source",
              percentage: 100,
            };
            updateEvent(failure);
          }
        } catch (error) {
          let errorMessage: string = "";
          if (typeof error === "string") {
            errorMessage = error;
          } else if (error instanceof Error) {
            errorMessage = error.message;
          }
          const failure: ScraperEvent<"update"> = {
            id: server.hash,
            status: "failure",
            error: errorMessage,
            reason: "Failed to fetch source",
            percentage: 100,
          };
          updateEvent(failure);
        }
      }
      return getResult(result);
    },
    [getResult, startEvent, updateEvent, startScrape, initSourceOrder],
  );

  const startScraping = useCallback(
    async (media: MWScrapeMedia) => {
      const providerApiUrl = getLoadbalancedProviderApiUrl();
      if (providerApiUrl && !isExtensionActiveCached()) {
        startScrape();
        const baseUrlMaker = makeProviderUrl(providerApiUrl);
        const conn = await connectServerSideEvents<RunOutput | "">(
          baseUrlMaker.scrapeAll(media),
          ["completed", "noOutput"],
        );
        conn.on("init", initEvent);
        conn.on("start", startEvent);
        conn.on("update", updateEvent);
        conn.on("discoverEmbeds", discoverEmbedsEvent);
        const sseOutput = await conn.promise();
        if (sseOutput && isExtensionActiveCached())
          await prepareStream(sseOutput.stream);

        return getResult(sseOutput === "" ? null : sseOutput);
      }

      startScrape();
      const providers = getProviders();
      const output = await providers.runAll({
        media,
        sourceOrder: preferredSourceOrder,
        events: {
          init: initEvent,
          start: startEvent,
          update: updateEvent,
          discoverEmbeds: discoverEmbedsEvent,
        },
      });
      if (output && isExtensionActiveCached())
        await prepareStream(output.stream);
      return getResult(output);
    },
    [
      initEvent,
      startEvent,
      updateEvent,
      discoverEmbedsEvent,
      getResult,
      startScrape,
      preferredSourceOrder,
    ],
  );

  return {
    startScraping,
    startScrapingSource,
    sourceOrder,
    sources,
    currentSource,
  };
}

export function useListCenter(
  containerRef: RefObject<HTMLDivElement | null>,
  listRef: RefObject<HTMLDivElement | null>,
  sourceOrder: ScrapingItems[],
  currentSource: string | undefined,
) {
  const [renderedOnce, setRenderedOnce] = useState(false);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    if (!listRef.current) return;

    const elements = [
      ...listRef.current.querySelectorAll("div[data-source-id]"),
    ] as HTMLDivElement[];

    const currentIndex = elements.findIndex(
      (e) => e.getAttribute("data-source-id") === currentSource,
    );

    const currentElement = elements[currentIndex];

    if (!currentElement) return;

    const containerWidth = containerRef.current.getBoundingClientRect().width;
    const listWidth = listRef.current.getBoundingClientRect().width;

    const containerHeight = containerRef.current.getBoundingClientRect().height;

    const listTop = listRef.current.getBoundingClientRect().top;

    const currentTop = currentElement.getBoundingClientRect().top;
    const currentHeight = currentElement.getBoundingClientRect().height;

    const topDifference = currentTop - listTop;

    const listNewLeft = containerWidth / 2 - listWidth / 2;
    const listNewTop = containerHeight / 2 - topDifference - currentHeight / 2;

    listRef.current.style.transform = `translateY(${listNewTop}px) translateX(${listNewLeft}px)`;
    setTimeout(() => {
      setRenderedOnce(true);
    }, 150);
  }, [currentSource, containerRef, listRef, setRenderedOnce]);

  const updatePositionRef = useRef(updatePosition);

  useEffect(() => {
    updatePosition();
    updatePositionRef.current = updatePosition;
  }, [updatePosition, sourceOrder]);

  useEffect(() => {
    function resize() {
      updatePositionRef.current();
    }
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  return renderedOnce;
}
