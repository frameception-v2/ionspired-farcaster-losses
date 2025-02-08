"use client";

import { useEffect, useCallback, useState } from "react";
import sdk, {
  AddFrame,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/frame-sdk";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

import { config } from "~/components/providers/WagmiProvider";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, optimism } from "wagmi/chains";
import { useSession } from "next-auth/react";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";
import { PROJECT_TITLE } from "~/lib/constants";

function UnfollowerList({ unfollowers }: { unfollowers: Array<{ fid: number, username: string, unfollowedAt: Date }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Unfollowers</CardTitle>
        <CardDescription>Last 10 users who stopped following you</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {unfollowers.length === 0 ? (
          <div className="text-center text-gray-500">No unfollowers found</div>
        ) : (
          unfollowers.map((unfollower) => (
            <div key={unfollower.fid} className="flex justify-between items-center py-1">
              <div>
                <span className="font-medium">{truncateAddress(unfollower.username)}</span>
                <span className="text-xs text-gray-500 ml-2">
                  {unfollower.unfollowedAt.toLocaleDateString()}
                </span>
              </div>
              <button 
                className="text-red-500 hover:text-red-700 text-xs"
                onClick={() => console.log('Report', unfollower.fid)}
              >
                Report
              </button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function Frame() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();
  const [unfollowers, setUnfollowers] = useState<Array<{ fid: number, username: string, unfollowedAt: Date }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [added, setAdded] = useState(false);

  const [addFrameResult, setAddFrameResult] = useState("");

  const addFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      if (error instanceof AddFrame.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddFrame.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  const fetchUnfollowers = useCallback(async () => {
    try {
      // Get current followers
      const followersResponse = await fetch(
        `https://api.neynar.com/v1/farcaster/followers?fid=${context?.user?.fid}&limit=100`,
        {
          headers: {
            'api_key': NEYNAR_API_KEY,
            'content-type': 'application/json'
          }
        }
      );
      
      // Get following list to compare
      const followingResponse = await fetch(
        `https://api.neynar.com/v1/farcaster/following?fid=${context?.user?.fid}&limit=100`,
        {
          headers: {
            'api_key': NEYNAR_API_KEY,
            'content-type': 'application/json'
          }
        }
      );

      const [followers, following] = await Promise.all([
        followersResponse.json(),
        followingResponse.json()
      ]);

      // Find users who are in followers but not in following
      const formerFollowers = followers.filter((follower: any) => 
        !following.some((f: any) => f.fid === follower.fid)
      );

      // Get usernames for the unfollowers
      const unfollowerDetails = await Promise.all(
        formerFollowers.slice(0, 10).map(async (follower: any) => {
          const res = await fetch(
            `https://api.neynar.com/v1/farcaster/user?fid=${follower.fid}`,
            {
              headers: {
                'api_key': NEYNAR_API_KEY,
                'content-type': 'application/json'
              }
            }
          );
          const data = await res.json();
          return {
            fid: follower.fid,
            username: data.result.user.username,
            unfollowedAt: new Date(follower.updated_at)
          };
        })
      );

      setUnfollowers(unfollowerDetails);
    } catch (error) {
      console.error('Error fetching unfollowers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [context?.user?.fid]);

  useEffect(() => {
    const load = async () => {
      if (context?.user?.fid) {
        await fetchUnfollowers();
      }
      const context = await sdk.context;
      if (!context) {
        return;
      }

      setContext(context);
      setAdded(context.client.added);

      // If frame isn't already added, prompt user to add it
      if (!context.client.added) {
        addFrame();
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        console.log("frameAddRejected", reason);
      });

      sdk.on("frameRemoved", () => {
        console.log("frameRemoved");
        setAdded(false);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        console.log("notificationsEnabled", notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        console.log("notificationsDisabled");
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    if (sdk && !isSDKLoaded) {
      console.log("Calling load");
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded, addFrame]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[300px] mx-auto py-2 px-2">
        <h1 className="text-2xl font-bold text-center mb-4 text-gray-700 dark:text-gray-300">
          {PROJECT_TITLE}
        </h1>
        {isLoading ? (
          <div className="text-center text-gray-500">Loading unfollower data...</div>
        ) : (
          <UnfollowerList unfollowers={unfollowers} />
        )}
      </div>
    </div>
  );
}
