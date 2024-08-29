import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useAsync } from "react-use";
import type { AsyncReturnType } from "type-fest";

import { isAllowedExtensionVersion } from "@/backend/extension/compatibility";
import { extensionInfo, sendPage } from "@/backend/extension/messaging";
import {
  handleMetaOutput,
  setCachedMetadata,
} from "@/backend/helpers/providerApi";
import { DetailedMeta, getMetaFromRequest } from "@/backend/metadata/getmeta";
import { TMDBMediaToMediaType } from "@/backend/metadata/tmdb";
import {
  MWMediaType,
  MetaRequest,
  ServerModel,
} from "@/backend/metadata/types/mw";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import { getServers } from "@/backend/metadata/vidsrc";
import { Button } from "@/components/buttons/Button";
import { Icons } from "@/components/Icon";
import { IconPill } from "@/components/layout/IconPill";
import { Loading } from "@/components/layout/Loading";
import { Paragraph } from "@/components/text/Paragraph";
import { Title } from "@/components/text/Title";
import { ErrorContainer, ErrorLayout } from "@/pages/layouts/ErrorLayout";
import { conf } from "@/setup/config";

export interface MetaPartProps {
  onGetMeta?: (meta: DetailedMeta, episodeId?: string) => void;
}

function isDisallowedMedia(id: string, type: MWMediaType): boolean {
  const disallowedEntries = conf().DISALLOWED_IDS.map((v) => v.split("-"));
  if (disallowedEntries.find((entry) => id === entry[1] && type === entry[0]))
    return true;
  return false;
}

export function MetaPart(props: MetaPartProps) {
  const { t } = useTranslation();
  const params = useParams<{
    id: string;
    type: TMDBContentTypes;
    episode?: string;
    season?: string;
  }>();
  const { id, type } = params;
  const navigate = useNavigate();

  const { error, value, loading } = useAsync(async () => {
    setCachedMetadata([]);
    if (!id || !type) {
      return null;
    }
    if (params.season && Number.isNaN(params.season)) {
      return null;
    }
    if (params.episode && Number.isNaN(params.episode)) {
      return null;
    }
    const info = await extensionInfo();
    const isValidExtension =
      info?.success && isAllowedExtensionVersion(info.version) && info.allowed;

    if (isValidExtension) {
      if (!info.hasPermission) throw new Error("extension-no-permission");
    }

    if (isDisallowedMedia(id, TMDBMediaToMediaType(type)))
      throw new Error("dmca");

    const request: MetaRequest = {
      id,
      type,
      season: Number(params.season),
      episode: Number(params.episode),
    };

    let meta: AsyncReturnType<typeof getMetaFromRequest> = null;
    try {
      meta = await getMetaFromRequest(request);
    } catch (err) {
      if ((err as any).status === 404) {
        return null;
      }
      throw err;
    }
    if (!meta) return null;

    // movie type
    if (meta.meta.type !== MWMediaType.SERIES) {
      const servers: ServerModel[] = await getServers(request);
      if (!servers?.length) {
        return null;
      }
      meta.servers = servers;
      props.onGetMeta?.(meta);
      handleMetaOutput(servers);
      return;
    }

    const {
      meta: { seasonData },
    } = meta;
    const { episodes } = seasonData;
    const seasonNumber = seasonData.number;
    const episodeNumber = episodes[0].number;

    // replace link with new link if youre not already on the right link
    let episodeId: string = "";
    request.season = seasonNumber;

    // not season and not episode -> default
    if (!params.episode) {
      episodeId = episodes[0].id;
      request.episode = episodeNumber;
      navigate(`/embed/${type}/${id}/${seasonNumber}/${episodeNumber}`, {
        replace: true,
      });
    } else {
      const episode = episodes.find(
        (item) => item.number.toString() === params.episode,
      );
      if (!episode?.id) {
        return null;
      }
      episodeId = episode.id;
      request.episode = episode.number;
    }

    const servers: ServerModel[] = await getServers(request);
    if (!servers?.length) {
      return null;
    }

    meta.servers = servers;
    handleMetaOutput(servers);
    props.onGetMeta?.(meta, episodeId);
  }, []);

  if (error && error.message === "extension-no-permission") {
    return (
      <ErrorLayout>
        <ErrorContainer>
          <IconPill icon={Icons.WAND}>
            {t("player.metadata.extensionPermission.badge")}
          </IconPill>
          <Title>{t("player.metadata.extensionPermission.title")}</Title>
          <Paragraph>{t("player.metadata.extensionPermission.text")}</Paragraph>
          <Button
            onClick={() => {
              sendPage({
                page: "PermissionGrant",
                redirectUrl: window.location.href,
              });
            }}
            theme="purple"
            padding="md:px-12 p-2.5"
            className="mt-6"
          >
            {t("player.metadata.extensionPermission.button")}
          </Button>
        </ErrorContainer>
      </ErrorLayout>
    );
  }

  if (error && error.message === "dmca") {
    return (
      <ErrorLayout>
        <ErrorContainer>
          <IconPill icon={Icons.DRAGON}>
            {t("player.metadata.dmca.badge")}
          </IconPill>
          <Title>{t("player.metadata.dmca.title")}</Title>
          <Paragraph>{t("player.metadata.dmca.text")}</Paragraph>
        </ErrorContainer>
      </ErrorLayout>
    );
  }

  if (error && error.message === "failed-api-metadata") {
    return (
      <ErrorLayout>
        <ErrorContainer>
          <IconPill icon={Icons.WAND}>
            {t("player.metadata.failed.badge")}
          </IconPill>
          <Title>{t("player.metadata.api.text")}</Title>
          <Paragraph>{t("player.metadata.api.title")}</Paragraph>
        </ErrorContainer>
      </ErrorLayout>
    );
  }

  if (error) {
    return (
      <ErrorLayout>
        <ErrorContainer>
          <IconPill icon={Icons.WAND}>
            {t("player.metadata.failed.badge")}
          </IconPill>
          <Title>{t("player.metadata.failed.title")}</Title>
          <Paragraph>{t("player.metadata.failed.text")}</Paragraph>
        </ErrorContainer>
      </ErrorLayout>
    );
  }

  if (!value && !loading) {
    return (
      <ErrorLayout>
        <ErrorContainer>
          <IconPill icon={Icons.WAND}>
            {t("player.metadata.notFound.badge")}
          </IconPill>
          <Title>{t("player.metadata.notFound.title")}</Title>
          <Paragraph>{t("player.metadata.notFound.text")}</Paragraph>
        </ErrorContainer>
      </ErrorLayout>
    );
  }

  return (
    <ErrorLayout>
      <div className="flex items-center justify-center">
        <Loading />
      </div>
    </ErrorLayout>
  );
}
