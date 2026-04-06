package net.val360.xscout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class YahooFinanceClient {
    private static final String QUOTE_URL =
        "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%s";
    private static final String CHART_URL =
        "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=3mo&interval=1d";
    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 10000;

    StockSnapshot fetchSnapshot(String ticker) throws IOException {
        String normalizedTicker = ticker.toUpperCase();

        JSONObject quote = fetchQuote(normalizedTicker);
        if (quote == null) {
            return null;
        }

        List<Double> closes = fetchDailyCloses(normalizedTicker);
        double lastClose = closes.isEmpty() ? Double.NaN : closes.get(closes.size() - 1);

        double price = readOptionalDouble(quote, "regularMarketPrice");
        if (Double.isNaN(price)) {
            price = lastClose;
        }
        double marketCap = readOptionalDouble(quote, "marketCap");

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
        String encodedTicker = URLEncoder.encode(ticker, "UTF-8");
        String url = String.format(QUOTE_URL, encodedTicker);
        JSONObject response = readJson(url);

        JSONObject quoteResponse = response.optJSONObject("quoteResponse");
        if (quoteResponse == null) {
            return null;
        }

        JSONArray results = quoteResponse.optJSONArray("result");
        if (results == null || results.length() == 0) {
            return null;
        }

        return results.optJSONObject(0);
    }

    private List<Double> fetchDailyCloses(String ticker) throws IOException {
        String encodedTicker = URLEncoder.encode(ticker, "UTF-8");
        String url = String.format(CHART_URL, encodedTicker);
        JSONObject response = readJson(url);

        JSONObject chart = response.optJSONObject("chart");
        if (chart == null) {
            return new ArrayList<>();
        }

        JSONArray result = chart.optJSONArray("result");
        if (result == null || result.length() == 0) {
            return new ArrayList<>();
        }

        JSONObject firstResult = result.optJSONObject(0);
        if (firstResult == null) {
            return new ArrayList<>();
        }

        JSONObject indicators = firstResult.optJSONObject("indicators");
        if (indicators == null) {
            return new ArrayList<>();
        }

        JSONArray quote = indicators.optJSONArray("quote");
        if (quote == null || quote.length() == 0) {
            return new ArrayList<>();
        }

        JSONObject firstQuote = quote.optJSONObject(0);
        if (firstQuote == null) {
            return new ArrayList<>();
        }

        JSONArray closes = firstQuote.optJSONArray("close");
        if (closes == null || closes.length() == 0) {
            return new ArrayList<>();
        }

        List<Double> output = new ArrayList<>();
        for (int i = 0; i < closes.length(); i++) {
            if (!closes.isNull(i)) {
                output.add(closes.getDouble(i));
            }
        }
        return output;
    }

    private JSONObject readJson(String requestUrl) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(requestUrl).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "xscout-stock-watchlist/1.0");

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

    private double readOptionalDouble(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) {
            return Double.NaN;
        }
        return object.getDouble(key);
    }
}
