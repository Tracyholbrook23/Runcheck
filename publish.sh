#!/bin/bash
cd ~/Desktop/RunCheck
echo "📦 Publishing update..."
eas update --branch preview --message "latest update"
echo ""
echo "🔗 Fetching new link..."
GROUP_ID=$(eas update:list | grep "Group ID" | head -1 | awk '{print $NF}')
echo ""
echo "✅ Done! Send this link to your testers:"
echo ""
echo "exp://u.expo.dev/bbdc4eed-d1b9-4a11-87bb-b9f8dcd8f55d/group/$GROUP_ID"
echo ""
