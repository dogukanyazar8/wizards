export type DmPolicyValue = "EVERYONE" | "FRIENDS" | "MUTUAL_SERVERS" | "NOBODY";
export type FriendRequestPolicyValue =
  | "EVERYONE"
  | "MUTUAL_FRIENDS"
  | "MUTUAL_SERVERS"
  | "NOBODY";

export type CommunicationRelationship = {
  areFriends: boolean;
  haveMutualFriends: boolean;
  haveMutualServers: boolean;
};

export function canStartDirectMessage(
  policy: DmPolicyValue,
  relationship: Pick<CommunicationRelationship, "areFriends" | "haveMutualServers">,
) {
  switch (policy) {
    case "EVERYONE":
      return true;
    case "FRIENDS":
      return relationship.areFriends;
    case "MUTUAL_SERVERS":
      return relationship.haveMutualServers;
    case "NOBODY":
      return false;
    default:
      return false;
  }
}

export function canSendFriendRequest(
  policy: FriendRequestPolicyValue,
  relationship: Pick<
    CommunicationRelationship,
    "haveMutualFriends" | "haveMutualServers"
  >,
) {
  switch (policy) {
    case "EVERYONE":
      return true;
    case "MUTUAL_FRIENDS":
      return relationship.haveMutualFriends;
    case "MUTUAL_SERVERS":
      return relationship.haveMutualServers;
    case "NOBODY":
      return false;
    default:
      return false;
  }
}
