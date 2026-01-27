const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined'
    ? new Intl.Segmenter('zh', { granularity: 'grapheme' })
    : null;

const splitGraphemes = (value: string) =>
  segmenter
    ? Array.from(segmenter.segment(value), (segment) => segment.segment)
    : Array.from(value);

const isWideChar = (segment: string) => (segment.codePointAt(0) ?? 0) > 0xff;

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 20;
export const USER_BIO_MAX = 100;
export const POST_TITLE_MAX_UNITS = 40;
export const POST_BODY_MAX = 2000;
export const POST_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COMMENT_MAX = 2000;
export const REPORT_DETAIL_MAX = 500;

export const getGraphemeCount = (value: string) => splitGraphemes(value).length;

export const getTitleUnits = (value: string) =>
  splitGraphemes(value).reduce(
    (total, segment) => total + (isWideChar(segment) ? 2 : 1),
    0,
  );
