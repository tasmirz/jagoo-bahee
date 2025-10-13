"use client";

import PostCard from "./PostCard";

const DUMMY_POSTS = [
    {
        id: "1",
        community: "r/GetMotivated",
        title: "Small steps compound into big change",
        excerpt: "Celebrate tiny wins today — each small step you take builds the momentum for something greater tomorrow.",
        votes: 342,
        comments: 48,
        age: "2h",
    },
    {
        id: "2",
        community: "r/LettersToFuture",
        title: "A letter to the future you",
        excerpt: "Write a note to the future: remind yourself of courage, kindness, and the dreams you refuse to give up.",
        votes: 128,
        comments: 19,
        age: "1d",
    },
    {
        id: "3",
        community: "r/CreativeProcess",
        title: "Embrace the mess of beginning",
        excerpt: "Creativity starts messy — allow imperfect experiments, learn, and iterate. Beauty often arrives after persistence.",
        votes: 215,
        comments: 34,
        age: "4d",
    },
];

export default function PostList() {
    return (
        <div className="space-y-4">
            {DUMMY_POSTS.map((p) => (
                <PostCard key={p.id} post={p} />
            ))}
        </div>
    );
}
