import { ScrapeMedia } from "@movie-web/providers";

import { TMDBContentTypes } from "./tmdb";

export enum MWMediaType {
  MOVIE = "movie",
  SERIES = "series",
  ANIME = "anime",
}

export type MWSeasonMeta = {
  id: string;
  number: number;
  title: string;
};

export type MWSeasonWithEpisodeMeta = {
  id: string;
  number: number;
  title: string;
  episodes: {
    id: string;
    number: number;
    title: string;
    air_date: string;
  }[];
};

type MWMediaMetaBase = {
  title: string;
  id: string;
  year?: string;
  poster?: string;
};

type MWMediaMetaSpecific =
  | {
      type: MWMediaType.MOVIE | MWMediaType.ANIME;
      seasons: undefined;
    }
  | {
      type: MWMediaType.SERIES;
      seasons: MWSeasonMeta[];
      seasonData: MWSeasonWithEpisodeMeta;
    };

export type MWMediaMeta = MWMediaMetaBase & MWMediaMetaSpecific;

export interface MWQuery {
  searchQuery: string;
}

export interface DetailedMeta {
  meta: MWMediaMeta;
  imdbId?: string;
  tmdbId?: string;
}

export interface MetaRequest {
  id: string;
  type: TMDBContentTypes;
  season?: number | undefined;
  episode?: number | undefined;
  seasonId?: string | undefined;
}

export interface ServerModel {
  name: string;
  hash: string;
}

export interface ServerResponse {
  data: ServerModel[];
}

export interface SubtitleModel {
  type: "vtt" | "srt";
  file: string;
  label: string;
  languageCode: string;
}

export interface SourceModel {
  source: string;
  thumbnails: string;
  subtitles: SubtitleModel[];
}

export interface SourceResponse {
  data: SourceModel;
}

export type MWScrapeMedia = ScrapeMedia & {
  servers?: ServerModel[];
};
