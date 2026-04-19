import nock from "nock";
import { fetchPage } from "../fetcher.js";

describe("fetchPage", () => {
  beforeAll(() => nock.disableNetConnect()); // Net off

  afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("should successfully fetch a page", async () => {
    const url = "https://example.com/test";
    const htmlContent = "<html><body>Test Content</body></html>";

    nock("https://example.com")
      .get("/test")
      .reply(200, htmlContent, { "content-type": "text/html" });

    // Sab kuch allowed
    nock("https://example.com").get("/robots.txt").reply(404);

    const result = await fetchPage(url);

    expect(result).not.toBeNull();
    expect(result?.html).toBe(htmlContent);
    expect(result?.statusCode).toBe(200);
  });

  it('should return null if blocked by robots.txt', async () => {
    const url = 'https://blocked.com/secret';

    nock('https://blocked.com').get('/robots.txt').reply(200, 'User-agent: *\nDisallow: /secret');

    const result = await fetchPage(url);

    expect(result).toBeNull();
  });

  it('should fail on 404 and not retry', async () => {
    const url = 'https://missing.com/404';

    nock('https://missing.com').get('/404').reply(404);

    // Allow all
    nock('https://missing.com').get('/robots.txt').reply(404);

    const result = await fetchPage(url);

    expect(result).toBeNull();
  });

  it('should retry on transient 500 errors', async () => {
    const url = 'https://flaky.com/500';
    const htmlContent = '<html><body>Recovered</body></html>';

    // First attempt fails, second succeeds
    nock('https://flaky.com')
      .get('/500')
      .reply(500)
      .get('/500')
      .reply(200, htmlContent, { 'content-type': 'text/html' });

    // Koi blocked nhi
    nock('https://flaky.com').get('/robots.txt').reply(404);

    const result = await fetchPage(url);

    expect(result).not.toBeNull();
    expect(result?.html).toBe(htmlContent);
  });

  it('should abort if content-type is not HTML', async () => {
    const url = 'https://example.com/image.png';

    nock('https://example.com').get('/image.png').reply(200, 'fake-binary-data', { 'content-type': 'image/png' });

    // Koi blocked nhi
    nock('https://example.com').get('/robots.txt').reply(404);

    const result = await fetchPage(url);

    expect(result).toBeNull();
  });
});
