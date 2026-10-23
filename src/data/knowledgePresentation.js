/**
 * Copyright IBM Corp. 2026
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

const displayedId = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
};

const displayedValue = (value, notReported) => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return notReported;
  }
  return String(value);
};

export function formatContentSize(sizeBytes, locale = 'en', notReported = 'Not reported') {
  if (sizeBytes === null || sizeBytes === undefined || sizeBytes === '') return notReported;
  const bytes = Number(sizeBytes);
  if (!Number.isFinite(bytes) || bytes < 0) return notReported;

  const kilobytes = bytes / 1024;
  const maximumFractionDigits = bytes > 0 && bytes < 10 * 1024 ? 1 : 0;
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits }).format(kilobytes);
  return `${formatted} KB`;
}

export function getIndexingStatusTagType(status) {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase();
  if (['ready', 'indexed', 'complete', 'completed'].includes(normalized)) return 'green';
  if (['failed', 'error', 'rejected'].includes(normalized)) return 'red';
  if (['queued', 'pending', 'processing', 'indexing'].includes(normalized)) return 'blue';
  return 'warm-gray';
}

export function buildKnowledgeDocumentRows(documents, { notReported = 'Not reported' } = {}) {
  return documents.map((document, index) => ({
    id: displayedId(document.id, `unidentified-document-${index}`),
    name: displayedValue(document.name, notReported),
    visibility_scope: displayedValue(document.visibility_scope, notReported),
    in_language: displayedValue(document.in_language, notReported),
    indexing_status: displayedValue(document.indexing_status, notReported),
  }));
}

export function buildMediaObjectRows(mediaObjects, { notReported = 'Not reported', locale = 'en' } = {}) {
  return mediaObjects.map((media, index) => ({
    id: displayedId(media.id, `unidentified-media-${index}`),
    name: displayedValue(media.name, notReported),
    bucket_id: displayedValue(media.bucket_id, notReported),
    encoding_format: displayedValue(media.encoding_format, notReported),
    content_size: formatContentSize(media.content_size, locale, notReported),
  }));
}

export function interpretIngestionResult(data) {
  const documentId = data?.document?.id;
  const documentName = typeof data?.document?.name === 'string' ? data.document.name.trim() : '';
  if (documentId === null || documentId === undefined || documentId === '' || !documentName) {
    return { status: 'unverified' };
  }

  const count = data?.chunksIndexed;
  if (!Number.isInteger(count) || count < 0) {
    return { status: 'persisted_without_count', documentName };
  }

  return { status: 'reported', documentName, chunksIndexed: count };
}

export function buildStorageScopePrefix(organizationId, workspaceId) {
  if (organizationId === null || organizationId === undefined || organizationId === '') return null;
  if (workspaceId === null || workspaceId === undefined || workspaceId === '') return null;
  return `${organizationId}/${workspaceId}/`;
}

export function requireUploadedObjectPath({ data, error }) {
  if (error) throw error;
  if (typeof data?.path !== 'string' || data.path.trim() === '') {
    throw new Error('Storage upload did not return a persisted object path.');
  }
  return data.path;
}
