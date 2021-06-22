/* eslint-disable class-methods-use-this */
import { EventEmitter } from 'events';
import { getUrl } from '../utils/getApiConfig';
import UAParser from 'ua-parser-js';
import { loadDataFromLocalStorage, saveDataToLocalStorage } from '../utils/helpersTS';
import { getFileContentType } from '../utils/fileHelpers';

// =============================================

const defaultFields = ['token', 'sessionID', 'login', 'password'];

const LOCAL_STORAGE_TITLE = 'onlc';

export const NOTIFICATION = 'NOTIFICATION';
export const SUCCESS_LOGIN = 'SUCCESS_LOGIN';
export const UNAUTHORIZED = 'UNAUTHORIZED';

// =============================================

export interface RequestOptions {
  params?: Record<string, any>;
  customHeaders?: Record<string, any>;
  body?: Record<string, any>;
  contentType?: string;

  onlyParams?: boolean;
  withAuthHeaders?: boolean;
}

export interface RequestWithProgressOptions {
  params?: Record<string, any>;
  customHeaders?: Record<string, any>;
  body: any;
  contentType?: string;
  onProgress: (ev: ProgressEvent<EventTarget>) => any;
}

export enum RequestMethod {
  GET = 'GET',
  POST = 'POST',
}

// =============================================

class Session extends EventEmitter {

  private srvDelta: number = 0;
  private token: string = '';
  private sessionID: string = '';

  constructor() {
    super();
  }

  // ----------------------

  getTS() {

    return Date.now() + this.srvDelta;
  }

  getLocation(cmd: string) {
    return cmd.split('/').slice(1).join('/');
  }

  // ----------------------

  getDefaultHeaders(returnHeaders?: true): Headers;
  getDefaultHeaders(returnHeaders?: false): { rKey: string; _os: string; _br: string };
  getDefaultHeaders(returnHeaders: boolean = true) {
    const uaParser = new UAParser();
    const os = uaParser.getOS();
    const browser = uaParser.getBrowser();
    
    const osParam = `${os.name}#${os.version}`;
    const brParam = `${browser.name}#${browser.version}`;

    const headers = new Headers();

    if (returnHeaders) {
      headers.append('_os', osParam);
      headers.append('_br', brParam);
      headers.append('rKey', String.generateGUID());

      return headers;
    }

    return {
      rKey: String.generateGUID(),
      _os: osParam,
      _br: brParam,
    };
  }

  getAuthHeaders(location: string, returnHeaders?: true): Headers;
  getAuthHeaders(location: string, returnHeaders?: false): { rKey: string; _os: string; _br: string, _s: string; _t: number; _st: string };
  getAuthHeaders(location: string, returnHeaders: boolean = true) {
    const { token } = this;
    const ts = this.getTS();
    const ID = this.sessionID;

    const salt = token.substring(19, 23) + ID.substring(9, 17);
    const signature = salt + ID + ts + token + location;

    if (returnHeaders) {
      const headers = this.getDefaultHeaders(true);
      headers.append('_s', ID);
      headers.append('_t', String(ts));
      headers.append('_st', signature);

      return headers;
    }

    return {
      ...this.getDefaultHeaders(false),
      _s: ID,
      _t: ts,
      _st: signature,
    };
  }

  // ----------------------

  requestWithProgress = (cmd: string, options: RequestWithProgressOptions): Promise<any> => (
    new Promise((resolve, reject) => {
      const params = options.params || {};
      const customHeaders = options.customHeaders || {};

      const location = this.getLocation(cmd);

      const { onProgress, body } = options;
      let contentType = 'application/octet-stream';
      
      if (body) {
        params.fileName = encodeURIComponent(body.name);
        params['content-length'] = body.size;
        params['content-type'] = getFileContentType(body);
        contentType = getFileContentType(body);
      }

      const authParams = this.getAuthHeaders(location, false);

      for (const paramKey of Object.keys(params)) {
        if (params[paramKey] === undefined) {
          delete params[paramKey];
        }
      }

      const url = getUrl(cmd, params);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);

      xhr.setRequestHeader('Content-Type', contentType);

      Object.keys(customHeaders).forEach((key) => {
        xhr.setRequestHeader(key, customHeaders[key]);
      });
      Object.keys(authParams).forEach((key) => {
        xhr.setRequestHeader(key, authParams[key]);
      });

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;

        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
          return;
        }
        reject(xhr.status);
      }

      xhr.upload.onprogress = onProgress;

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.code === 200) {
            resolve(response);
            return;
          }
          reject(response);
        } catch (e) {
          reject(xhr.status);
        }
      };

      xhr.onerror = () => {
        reject(xhr.status);
      };

      xhr.send(body);
    })
  );

  // ----------------------

  saveDataToLocalStorage() {
    saveDataToLocalStorage(defaultFields, this, LOCAL_STORAGE_TITLE);
  };

  loadDataFromLocalStorage() {
    loadDataFromLocalStorage(this, LOCAL_STORAGE_TITLE);
  }
}

export default new Session();
