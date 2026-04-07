package net.val360.xscout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class YahooFinanceStockDataClient {
    private static final String QUOTE_URL =
        "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%s";
    private static final String CHART_URL =
        "https://query1.finance.yahoo.com/v8/finance/chart/%s?interval=1d&range=6mo";

    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 10000;

    StockSnapshot fetchSnapshot(String ticker) throws IOException {
        String normalizedTicker = ticker.toUpperCase();
        JSONObject quote = fetchQuote(normalizedTicker);

        double price = readNumber(quote, "regularMarketPrice");
        double marketCap = readNumber(quote, "marketCap");
        List<Double> closes = fetchChartCloses(normalizedTicker);

        return new StockSnapshot(
            normalizedTicker,
            price,
            marketCap,
            computePerformance(closes, 1),
            computePerformance(closes, 5),
            computePerformance(closes, 10),
            computePerformance(closes, 21),
            computePerformance(closes, 63)
        );
    }

    private JSONObject fetchQuote(String ticker) throws IOException {
        JSONObject response = readJson(String.format(QUOTE_URL, ticker));
        JSONObject quoteResponse = response.optJSONObject("quoteResponse");
        if (quoteResponse == null) {
            throw new IOException("Unexpected quote response schema from Yahoo Finance.");
        }

        JSONArray result = quoteResponse.optJSONArray("result");
        if (result == null || result.length() == 0) {
            throw new IOException("No quote data returned by Yahoo Finance for " + ticker + ".");
        }

        JSONObject first = result.optJSONObject(0);
        if (first == null) {
            throw new IOException("Unexpected quote payload from Yahoo Finance for " + ticker + ".");
        }
        return first;
    }

    private List<Double> fetchChartCloses(String ticker) throws IOException {
        JSONObject response = readJson(String.format(CHART_URL, ticker));
        JSONObject chart = response.optJSONObject("chart");
        if (chart == null) {
            return new ArrayList<>();
        }

        JSONArray result = chart.optJSONArray("result");
        if (result == null || result.length() == 0) {
            return new ArrayList<>();
        }

        JSONObject first = result.optJSONObject(0);
        if (first == null) {
            return new ArrayList<>();
        }

        JSONObject indicators = first.optJSONObject("indicators");
        if (indicators == null) {
            return new ArrayList<>();
        }

        JSONArray quote = indicators.optJSONArray("quote");
        if (quote == null || quote.length() == 0) {
            return new ArrayList<>();
        }

        JSONObject quoteValues = quote.optJSONObject(0);
        if (quoteValues == null) {
            return new ArrayList<>();
        }

        JSONArray closesRaw = quoteValues.optJSONArray("close");
        if (closesRaw == null || closesRaw.length() == 0) {
            return new ArrayList<>();
        }

        List<Double> closes = new ArrayList<>();
        for (int i = 0; i < closesRaw.length(); i++) {
            Object value = closesRaw.get(i);
            if (JSONObject.NULL.equals(value) || !(value instanceof Number)) {
                continue;
            }
            double close = ((Number) value).doubleValue();
            if (!Double.isNaN(close) && !Double.isInfinite(close)) {
                closes.add(close);
            }
        }
        return closes;
    }

    private JSONObject readJson(String requestUrl) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(requestUrl).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
        );

        int status = connection.getResponseCode();
        InputStream stream;
        if (status >= 200 && status < 300) {
            stream = connection.getInputStream();
        } else {
            stream = connection.getErrorStream();
            String errorBody = stream == null ? "" : readUtf8(stream);
            throw new IOException("HTTP " + status + " from " + requestUrl + ": " + errorBody);
        }

        String body = readUtf8(stream);
        return new JSONObject(body);
    }

    private String readUtf8(InputStream stream) throws IOException {
        try (InputStream in = stream) {
            byte[] bytes = new byte[8192];
            StringBuilder builder = new StringBuilder();
            int read;
            while ((read = in.read(bytes)) >= 0) {
                builder.append(new String(bytes, 0, read, StandardCharsets.UTF_8));
            }
            return builder.toString();
        }
    }

    private double computePerformance(List<Double> closes, int tradingDaysBack) {
        if (closes == null || closes.size() < 2) {
            return Double.NaN;
        }

        int currentIndex = closes.size() - 1;
        int startIndex = currentIndex - tradingDaysBack;
        if (startIndex < 0) {
            return Double.NaN;
        }

        double start = closes.get(startIndex);
        double end = closes.get(currentIndex);
        if (start == 0.0d) {
            return Double.NaN;
        }

        return ((end - start) / start) * 100.0d;
    }

    private double readNumber(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) {
            return Double.NaN;
        }
        Object value = object.get(key);
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        return Double.NaN;
    }
}
