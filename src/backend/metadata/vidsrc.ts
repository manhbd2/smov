import { conf } from "@/setup/config";

import {
  MetaRequest,
  ServerModel,
  ServerResponse,
  SourceModel,
  SourceResponse,
} from "./types/mw";
import { mwFetch } from "../helpers/fetch";

const baseURL: string = conf().VITE_VIDSRC_SERVICE_URL;

const headers = {
  accept: "application/json",
};

async function get<T>(url: string, params?: object): Promise<T> {
  const res = await mwFetch<any>(encodeURI(url), {
    headers,
    baseURL,
    params: {
      ...params,
    },
  });
  return res;
}

export async function getServers(request: MetaRequest): Promise<ServerModel[]> {
  const { id, type } = request;
  const data = await get<ServerResponse>(`/${id}/servers?type=${type}`);
  return data.data;
}

export async function getSources(hash: string): Promise<SourceModel> {
  const data = await get<SourceResponse>(`/source/${hash}`);
  return data.data;
}
