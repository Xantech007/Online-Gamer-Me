<?php
$apk_url = "https://raw.githubusercontent.com/Xantech007/Online-Gamer-Me/main/android-download/177351_OnlineGamer.apk";

header("Content-Type: application/vnd.android.package-archive");
header("Content-Disposition: attachment; filename=\"OnlineGamer.apk\"");
header("Location: " . $apk_url);
exit();
?>
