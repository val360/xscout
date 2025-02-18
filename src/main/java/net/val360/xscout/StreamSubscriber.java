package net.val360.xscout;

import org.json.JSONObject;

/**
 *
 * @author smelis
 */
public interface StreamSubscriber {
    
    void onSubscription(StreamSubscription subscription, JSONObject message);
    
}
