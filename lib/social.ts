import { Timestamp } from "firebase-admin/firestore";
import { eventCollection } from "@/lib/events";

export const SOCIAL_PAGE_SIZE = 10;

export function photoUrl(eventId: string, postId: string) {
  return `/api/instagram/photo?event=${encodeURIComponent(eventId)}&id=${encodeURIComponent(postId)}`;
}

function toCursor(value: unknown) {
  return value instanceof Timestamp ? `${value.seconds}_${value.nanoseconds}` : "";
}

function fromCursor(cursor: string) {
  const [seconds, nanos] = cursor.split("_").map(Number);
  return Number.isFinite(seconds) && Number.isFinite(nanos) ? new Timestamp(seconds, nanos) : null;
}

// One page of the photo feed. Image bytes are left out (select) and served by /api/instagram/photo instead,
// so a page costs roughly 10 posts + their comments/likes reads and stays far below the response size limit.
export async function getSocialFeed(eventId: string, cursor?: string) {
  let query = eventCollection(eventId, "socialPosts")
    .orderBy("createdAt", "desc")
    .select("employeeId", "authorName", "caption", "capturedAt", "createdAt")
    .limit(SOCIAL_PAGE_SIZE + 1);
  const after = cursor ? fromCursor(cursor) : null;
  if (after) query = query.startAfter(after);
  const [snap, totalSnap] = await Promise.all([
    query.get(),
    cursor ? Promise.resolve(null) : eventCollection(eventId, "socialPosts").count().get(),
  ]);
  const docs = snap.docs.slice(0, SOCIAL_PAGE_SIZE);
  const ids = docs.map((doc) => doc.id);
  const [commentSnap, likeSnap] = ids.length
    ? await Promise.all([
        eventCollection(eventId, "socialComments").where("postId", "in", ids).get(),
        eventCollection(eventId, "socialLikes").where("postId", "in", ids).get(),
      ])
    : [null, null];
  const comments = (commentSnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() })) || []) as any[];
  const likes = (likeSnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() })) || []) as any[];
  const socialPosts = docs.map((doc) => {
    const row = doc.data();
    return {
      id: doc.id,
      employeeId: row.employeeId,
      authorName: row.authorName,
      caption: row.caption,
      imageUrl: photoUrl(eventId, doc.id),
      capturedAt: row.capturedAt,
      createdAt: row.createdAt,
      comments: comments.filter((comment) => comment.postId === doc.id).sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)),
      likedBy: likes.filter((like) => like.postId === doc.id).map((like) => like.employeeId),
    };
  });
  return {
    socialPosts,
    socialHasMore: snap.docs.length > SOCIAL_PAGE_SIZE,
    socialCursor: docs.length ? toCursor(docs[docs.length - 1].get("createdAt")) : "",
    ...(totalSnap ? { socialTotal: totalSnap.data().count } : {}),
  };
}
