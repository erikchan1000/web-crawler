import { PlaywrightCrawler, Dataset, Log, Dictionary } from "crawlee";
import { Page } from "playwright";
import { RouteGraph } from "./routeGraph";
import fs from "fs";
import { sanitize } from "./parsingAlgo";

interface AuthConfig {
  username: string;
  password: string;
  loginUrl?: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  // Optional selectors for more complex login flows
  mfaCodeSelector?: string;
  errorSelector?: string;
  successSelector?: string;
}

interface CrawlerConfig {
  maxDepth?: number;
  maxConcurrency?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  shouldCrawl?: (url: URL) => boolean;
  auth: AuthConfig;
  browserConfig?: {
    headless?: boolean;
  };
}

export class RouteCrawler {
  private graph: RouteGraph;
  private crawler: PlaywrightCrawler;
  private readonly config: Required<CrawlerConfig>;
  private isAuthenticated: boolean = false;
  private loginAttempts: number = 0;
  private readonly MAX_LOGIN_ATTEMPTS = 3;
  private visitedRoutes = new Set<string>();
  private cookies: any = [];

  constructor(
    private readonly baseUrl: string,
    config: CrawlerConfig,
  ) {
    this.config = {
      maxDepth: config.maxDepth ?? 10,
      maxConcurrency: config.maxConcurrency ?? 5,
      includePatterns: config.includePatterns ?? [],
      excludePatterns: config.excludePatterns ?? [],
      shouldCrawl: config.shouldCrawl ?? (() => true),
      auth: config.auth,
      browserConfig: config.browserConfig ?? {
        headless: true,
      },
    };

    this.graph = new RouteGraph(this.baseUrl);

    this.crawler = new PlaywrightCrawler({
      maxConcurrency: this.config.maxConcurrency,
      requestHandler: this.handleRequest.bind(this),
      failedRequestHandler: this.handleFailedRequest.bind(this),
      navigationTimeoutSecs: 300,
      ...this.config.browserConfig,
      browserPoolOptions: {
        useFingerprints: true,
      },
      useSessionPool: true,
      persistCookiesPerSession: true,
      launchContext: {
        launchOptions: {
          viewport: {
            width: 1920,
            height: 1080,
          },
          ignoreHTTPSErrors: true,
          headless: this.config.browserConfig.headless,
        },
      },
      postNavigationHooks: [
        async ({ page, request }) => {
          await page.evaluate(() => {
            window.addEventListener("click", (event) => {
              const el = event.target as HTMLElement;
              el.style.outline = "2px solid red";
              setTimeout(() => {
                el.style.outline = "";
              }, 1000);
            });
          });
        },
      ],
    });
  }

  private async handleRequest({
    page,
    request,
    enqueueLinks,
    log,
  }: {
    page: Page;
    request: {
      url: string;
      userData: Dictionary;
    };
    enqueueLinks: (options: {
      urls: string[];
      userData: Dictionary;
    }) => Promise<any>;
    log: Log;
  }): Promise<void> {
    const currentUrl = new URL(request.url);
    const params = this.extractUrlParams(currentUrl);
    const queryParams = this.extractQueryParams(currentUrl);

    const { fromPath, depth } = request.userData;
    if (this.cookies.length > 0) {
      await page.context().addCookies(this.cookies);
    }

    if (
      depth > this.config.maxDepth ||
      (this.visitedRoutes.has(
        `${currentUrl.pathname}_${currentUrl.searchParams}`,
      ) &&
        !currentUrl.pathname.includes("sign_in"))
    ) {
      return;
    }

    log.info(
      `Processing ${currentUrl.pathname}/${currentUrl.searchParams} (from: ${fromPath || "root"}, depth: ${depth})`,
    );

    try {
      // Take initial screenshot
      // await this.takeScreenshot(page, currentUrl.pathname, "before_auth");

      // Check if we need to authenticate
      const needsAuth = await this.checkIfAuthenticationNeeded(page);
      if (needsAuth) {
        const authSuccess = await this.handleAuthentication(page, log);
        if (!authSuccess) {
          throw new Error("Authentication failed");
        }
      }

      await page.goto(request.url);

      await page.waitForLoadState("networkidle", {
        timeout: 150000,
      });

      // await this.takeScreenshot(page, currentUrl.pathname, "after_auth");
      //
      const result = await page.evaluate(() => {
        if (typeof (window as any).setDataOptions === "function") {
          (window as any).setDataOptions(true);
          return "setDataOptions executed successfully";
        } else {
          return "setDataOptions is not defined on window";
        }
      });
      console.log("Result of setDataOptions: ", result);

      let parsedHtml = await page.content();
      parsedHtml = sanitize(parsedHtml);
      // Add current route to graph
      this.graph.addRoute(currentUrl.pathname, fromPath, {
        params,
        queryParams,
        depth,
        rawHtml: parsedHtml,
      });

      console.log("Adding query tab", currentUrl.searchParams.get("tab"));
      const tab = currentUrl.searchParams.get("tab");
      const subTab = currentUrl.searchParams.get("subtab");

      this.visitedRoutes.add(`${currentUrl.pathname}_${tab}_${subTab}`),
        // Process visible links
        await this.processVisibleLinks(page, currentUrl, depth, enqueueLinks);
    } catch (error: any) {
      log.error(
        `Failed to process ${request.url}: ${error instanceof Error ? error.message : String(error)}`,
      );

      // If authentication fails, retry with fresh session
      if (
        error.message.includes("Authentication failed") &&
        this.loginAttempts < this.MAX_LOGIN_ATTEMPTS
      ) {
        this.isAuthenticated = false;
        this.loginAttempts++;
        // Retry the current URL
        await this.crawler.addRequests([
          {
            url: request.url,
            userData: request.userData,
          },
        ]);
      }
    }
  }

  private async checkIfAuthenticationNeeded(page: Page): Promise<boolean> {
    try {
      // Check for login form elements
      const hasLoginForm =
        (await page.$(this.config.auth.usernameSelector)) !== null;
      if (hasLoginForm) return true;

      // Check for redirect to login page
      const currentUrl = page.url();
      return currentUrl.includes("/login") || currentUrl.includes("/signin");
    } catch (error) {
      console.error("Error checking authentication:", error);
      return true; // Assume auth needed on error
    }
  }

  private async handleAuthentication(page: Page, log: Log): Promise<boolean> {
    log.info("Starting authentication process...");

    try {
      // If we have a specific login URL, navigate to it
      if (this.config.auth.loginUrl) {
        await page.goto(this.config.auth.loginUrl);
      }

      // Wait for login form
      await page.waitForSelector(this.config.auth.usernameSelector);
      await page.waitForSelector(this.config.auth.passwordSelector);

      // Fill in credentials
      await page.fill(
        this.config.auth.usernameSelector,
        this.config.auth.username,
      );

      new Promise((resolve) => setTimeout(resolve, 1000));
      log.info("Filled username");
      await page.fill(
        this.config.auth.passwordSelector,
        this.config.auth.password,
      );
      log.info("Filled password");
      new Promise((resolve) => setTimeout(resolve, 1000));

      // Take screenshot before submitting
      // await this.takeScreenshot(page, "login", "before_submit");

      // Submit form
      await page.click(this.config.auth.submitSelector);

      // Wait for navigation
      await page.waitForLoadState("networkidle", {
        timeout: 150000,
      });

      // Handle potential MFA
      if (this.config.auth.mfaCodeSelector) {
        const hasMfa =
          (await page.$(this.config.auth.mfaCodeSelector)) !== null;
        if (hasMfa) {
          log.info("MFA detected, waiting for manual input...");
          // await this.takeScreenshot(page, "login", "mfa_required");
          // Wait for MFA to be completed (you might want to implement a specific handling here)
          await page.waitForNavigation({ timeout: 60000 });
        }
      }

      // Check for successful login
      if (this.config.auth.successSelector) {
        await page.waitForSelector(this.config.auth.successSelector, {
          timeout: 150000,
        });
      }

      // Check for error messages
      if (this.config.auth.errorSelector) {
        const errorElement = await page.$(this.config.auth.errorSelector);
        if (errorElement) {
          const errorText = await errorElement.textContent();
          throw new Error(`Login failed: ${errorText}`);
        }
      }

      // Take screenshot after login attempt
      // await this.takeScreenshot(page, "login", "after_submit");

      this.isAuthenticated = true;
      log.info("Authentication successful");
      this.cookies = await page.context().cookies();
      return true;
    } catch (error: any) {
      log.error(`Authentication failed: ${error.message}`);
      await this.takeScreenshot(page, "login", "error");
      return false;
    }
  }

  private async takeScreenshot(
    page: Page,
    pathname: string,
    suffix: string,
  ): Promise<void> {
    const sanitizedPath = pathname.replace(/\//g, "_");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = `screenshots/${sanitizedPath}_${suffix}_${timestamp}.png`;

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
  }

  private async processVisibleLinks(
    page: Page,
    currentUrl: URL,
    depth: number,
    enqueueLinks: (options: { urls: string[]; userData: any }) => Promise<void>,
  ): Promise<void> {
    const links = await page.$$eval("a[href]", (els) =>
      els
        .map((el) => el.getAttribute("href"))
        .filter((href): href is string => href !== null),
    );

    const validLinks = links
      .map((href) => {
        try {
          return new URL(href, currentUrl.origin);
        } catch {
          return null;
        }
      })

      .filter((url): url is URL => {
        if (!url) return false;
        return url.origin === currentUrl.origin && this.shouldCrawlUrl(url);
      })
      .map((url) => url.href);

    if (validLinks.length > 0 && depth < this.config.maxDepth) {
      await enqueueLinks({
        urls: validLinks,
        userData: {
          fromPath: currentUrl.pathname,
          depth: depth + 1,
        },
      });
    }
  }

  private async processDynamicRoutes(
    page: Page,
    currentUrl: URL,
    depth: number,
    enqueueLinks: (options: { urls: string[]; userData: any }) => Promise<void>,
  ): Promise<void> {
    const dynamicRoutes = await page.evaluate(() => {
      const routes: string[] = [];

      // Check common router locations
      const win = window as any;
      if (win.__ROUTES__) routes.push(...win.__ROUTES__);
      if (win.__INITIAL_STATE__?.router?.routes) {
        routes.push(...win.__INITIAL_STATE__.router.routes);
      }

      // Extract routes from script tags
      const scripts = document.getElementsByTagName("script");
      for (const script of scripts) {
        const text = script.textContent || "";
        const urlMatches = text.match(/['"`](\/[^'"`\s]+)['"`)]/g);
        if (urlMatches) {
          routes.push(...urlMatches.map((m) => m.slice(1, -1)));
        }
      }

      return routes;
    });

    const validRoutes = dynamicRoutes
      .filter((route) => {
        try {
          const url = new URL(route, currentUrl.origin);
          return this.shouldCrawlUrl(url);
        } catch {
          return false;
        }
      })
      .map((route) => new URL(route, currentUrl.origin).href);

    if (validRoutes.length > 0) {
      await enqueueLinks({
        urls: validRoutes,
        userData: {
          fromPath: currentUrl.pathname,
          depth: depth + 1,
        },
      });
    }
  }

  private async processNetworkRequests(
    page: Page,
    currentUrl: URL,
  ): Promise<void> {
    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");

    client.on("Network.requestWillBeSent", ({ request }) => {
      try {
        const url = new URL(request.url);
        if (url.origin === currentUrl.origin && this.shouldCrawlUrl(url)) {
          this.graph.addRoute(url.pathname, currentUrl.pathname, {
            params: this.extractUrlParams(url),
            queryParams: this.extractQueryParams(url),
          });
        }
      } catch (error) {
        // Ignore invalid URLs
      }
    });
  }

  private extractUrlParams(url: URL): Record<string, string> {
    const params: Record<string, string> = {};
    const segments = url.pathname.split("/").filter(Boolean);

    segments.forEach((segment, index) => {
      if (this.looksLikeParam(segment)) {
        params[`param${index}`] = segment;
      }
    });

    return params;
  }

  private extractQueryParams(url: URL): Record<string, string[]> {
    const params: Record<string, string[]> = {};
    url.searchParams.forEach((value, key) => {
      if (!params[key]) {
        params[key] = [];
      }
      if (!params[key].includes(value)) {
        params[key].push(value);
      }
    });
    return params;
  }

  private looksLikeParam(segment: string): boolean {
    const patterns = [
      /^[0-9a-f]{24}$/i, // MongoDB ObjectId
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
      /^\d+$/, // Numeric ID
      /^[A-Z]+-\d+$/i, // Issue-style ID (e.g., PROJ-123)
    ];
    return patterns.some((pattern) => pattern.test(segment));
  }

  private shouldCrawlUrl(url: URL): boolean {
    // Check custom shouldCrawl function
    if (!this.config.shouldCrawl(url)) return false;

    // Check include/exclude patterns
    const pathname = url.pathname;

    if (
      this.config.excludePatterns.some((pattern) =>
        new RegExp(pattern).test(pathname),
      )
    ) {
      return false;
    }

    if (
      this.config.includePatterns.length > 0 &&
      !this.config.includePatterns.some((pattern) =>
        new RegExp(pattern).test(pathname),
      )
    ) {
      return false;
    }

    return true;
  }

  private handleFailedRequest({
    request,
    log,
  }: {
    request: { url: string };
    log: Log;
  }): void {
    log.error(`Request failed: ${request.url}`);
  }

  public async run(): Promise<RouteGraph> {
    console.log(`Starting crawler at ${this.baseUrl}`);

    if (!fs.existsSync("screenshots")) {
      fs.mkdirSync("screenshots");
    }

    try {
      await this.crawler.run([
        {
          url: this.baseUrl,
          userData: {
            fromPath: null,
            depth: 0,
          },
        },
      ]);

      // Save final graph state

      return this.graph;
    } catch (error) {
      console.error("Crawler failed:", error);
      throw error;
    }
  }

  public getGraph(): RouteGraph {
    return this.graph;
  }
}
