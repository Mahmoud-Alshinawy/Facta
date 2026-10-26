use serde_json::Value;
pub fn next_export_ms(now: i64, previous: i64) -> i64 {now.max(previous.saturating_add(1))}
fn fields(v: &Value, allowed: &[&str]) -> bool {
    v.as_object().map_or(false, |o| o.len()==allowed.len() && o.keys().all(|k| allowed.contains(&k.as_str())))
}
pub fn parse(raw: &str, user: Option<&str>) -> Result<Value, String> {
    if raw.len()>65_536 {return Err("Shared widget export is too large".into());}
    let value:Value=serde_json::from_str(raw).map_err(|e|e.to_string())?;
    if !fields(&value,&["version","userId","defaultGroupId","groups","truncated","unavailable"]) || value["version"]!=1 || value["userId"].as_str()!=user {
        return Err("Shared widget account/contract mismatch".into());
    }
    let groups=value["groups"].as_array().ok_or("Shared groups must be an array")?;
    if groups.len()>16 || (user.is_none() && !groups.is_empty()) {return Err("Invalid shared group count".into());}
    for group in groups {
        if !fields(group,&["groupId","revision","name","timeZone","today","phase","reason","confirmedAt","archived","pending","stale","round","rows"]) {
            return Err("Invalid shared group fields".into());
        }
        if !group["round"].is_null() && !fields(&group["round"],&["start","end","activityEnd","endReason","active","averagePct"]) {return Err("Invalid shared round fields".into());}
        let rows=group["rows"].as_array().ok_or("Shared rows must be an array")?;
        if rows.len()>4 || rows.iter().any(|r| !fields(r,&["userId","name","rank","adherencePct","isAtLeast70","self","left","completedDays","target"])) {
            return Err("Invalid shared leaderboard fields".into());
        }
    }
    Ok(value)
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn cleanup_exports_are_strictly_newer_even_in_one_millisecond() {
        assert_eq!(next_export_ms(100,100),101);
        assert_eq!(next_export_ms(90,100),101);
        assert_eq!(next_export_ms(200,100),200);
    }
    #[test] fn validates_account_and_bounds_without_private_fields() {
        let raw=r#"{"version":1,"userId":null,"defaultGroupId":null,"groups":[],"truncated":false,"unavailable":false}"#;
        assert!(parse(raw,None).is_ok());
        assert!(parse(raw,Some("different")).is_err());
        assert!(parse(&" ".repeat(65_537),None).is_err());
        assert!(parse(&raw.replace("\"version\":1", "\"token\":\"secret\",\"version\":1"),None).is_err());
    }
}
