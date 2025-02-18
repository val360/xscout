package net.val360.xscout;

import org.json.JSONObject;

/**
 *
 * @author smelis
 */
public interface CommandListener {
    
    void onResponse(JSONObject response);
    
}
