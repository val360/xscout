package net.val360.xscout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

final class NasdaqStockDataClient {
    private static final String INFO_URL =
        "https://api.nasdaq.com/api/quote/%s/info?assetclass=stocks";
    private static final String SUMMARY_URL =
        "https://api.nasdaq.com/api/quote/%s/summary?assetclass=stocks";
    private static final String CHART_URL =
        "https://api.nasdaq.com/api/quote/%s/chart?assetclass=stocks&fromdate=%s&todate=%s";

    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int READ_TIMEOUT_MS = 10000;

    StockSnapshot fetchSnapshot(String ticker) throws IOException {
        String normalizedTicker = ticker.toUpperCase();

        JSONObject infoData = readDataObject(String.format(INFO_URL, normalizedTicker));
        JSONObject summaryData = readDataObject(String.format(SUMMARY_URL, normalizedTicker));

        double price = parseMoneyOrNumber(
            infoData.optJSONObject("primaryData") == null
                ? null
                : infoData.optJSONObject("primaryData").optString("lastSalePrice", null)
        );

        double marketCap = Double.NaN;
        JSONObject summaryFields = summaryData.optJSONObject("summaryData");
        if (summaryFields != null) {
            JSONObject marketCapField = summaryFields.optJSONObject("MarketCap");
            if (marketCapField != null) {
                marketCap = parseMoneyOrNumber(marketCapField.optString("value", null));
            }
        }

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

    private List<Double> fetchChartCloses(String ticker) throws IOException {
        LocalDate toDate = LocalDate.now();
        LocalDate fromDate = toDate.minusMonths(4);

        String url = String.format(
            CHART_URL,
            ticker,
            fromDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
            toDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
        );

        JSONObject data = readDataObject(url);
        JSONArray chart = data.optJSONArray("chart");
        if (chart == null || chart.length() == 0) {
            return new ArrayList<>();
        }

        List<Double> closes = new ArrayList<>();
        for (int i = 0; i < chart.length(); i++) {
            JSONObject candle = chart.optJSONObject(i);
            if (candle == null) {
                continue;
            }

            JSONObject z = candle.optJSONObject("z");
            if (z == null) {
                continue;
            }

            double close = parseMoneyOrNumber(z.optString("close", null));
            if (!Double.isNaN(close)) {
                closes.add(close);
            }
        }
        return closes;
    }

    private JSONObject readDataObject(String requestUrl) throws IOException {
        JSONObject response = readJson(requestUrl);
        JSONObject data = response.optJSONObject("data");
        if (data == null) {
            throw new IOException("Unexpected response schema from " + requestUrl);
        }
        return data;
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
        connection.setRequestProperty("Origin", "https://www.nasdaq.com");
        connection.setRequestProperty("Referer", "https://www.nasdaq.com/");

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

    private double parseMoneyOrNumber(String value) {
        if (value == null) {
            return Double.NaN;
        }
        String normalized = value.replace("$", "").replace(",", "").replace("%", "").trim();
        if (normalized.isEmpty() || "--".equals(normalized)) {
            return Double.NaN;
        }
        try {
            return Double.parseDouble(normalized);
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }
}
