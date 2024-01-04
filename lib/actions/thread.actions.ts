"use server";

import { connectDB } from "../mongoose";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import { revalidatePath } from "next/cache";
import { exec } from "child_process";

interface Params {
  text: string;
  author: string;
  communityId: string | null;
  path: string;
}

export async function createThread({
  text,
  author,
  communityId,
  path,
}: Params) {
  try {
    connectDB();

    const createdThread = await Thread.create({
      text,
      author,
      community: null, // Assign communityId if provided, or leave it null for personal account
    });

    // Update User model
    await User.findByIdAndUpdate(author, {
      $push: { threads: createdThread._id },
    });

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to create thread: ${error.message}`);
  }
}

export async function fetchThreads(pageNumber = 1, pageSize = 20) {
  connectDB();

  // calculate the number of threads to skip
  const skipAmount = (pageNumber -1) * pageSize;
  
  
  const threadsQuery = Thread.find({ parentId: { $in: [null, undefined]}})
  .sort({ createdAt: 'desc' })
  .skip(skipAmount)
  .limit(pageSize)
  .populate({ path: 'author', model: User })
.populate({
    path: 'children',
    populate: {
      path: 'author',
      model: User,
      select: "_id name parentId image"
    }
  })

  const totalThreadsCount = await Thread.countDocuments({ parentId: { $in: [null, undefined]}})

  const threads = await threadsQuery.exec();

  const isNext = totalThreadsCount > skipAmount + threads.length;

  return { threads, isNext }
}

export async function fetchThreadById(id: string) {
try {
  connectDB();

  const thread = await Thread.findById(id)
  .populate({
    path: 'author',
    model: User,
    select: "_id name parentId image"
  })
  .populate({
    path: 'children',
    populate: [
      {
        path: 'author',
        model: User,
        select: "_id name parentId image"
      },
      {
        path: 'children',
        model: Thread,
        populate: {
          path: 'author',
          model: User,
          select: "_id name parentId image"
        }
      }
    ]
  }).exec();

  return thread;
} catch (error:any) {
  throw new Error(`Error fetching thread: ${error.message}`)
}
}


export async function addCommentToThread(threadId: string, commentText: string, userId: string, path: string) {
  connectDB();

  try {
    // Find the original thread by its ID
    const originalThread = await Thread.findById(threadId);

    if (!originalThread) {
      throw new Error("Thread not found");
    }

    // Create the new comment thread
    const commentThread = new Thread({
      text: commentText,
      author: userId,
      parentId: threadId, // Set the parentId to the original thread's ID
    });

    // Save the comment thread to the database
    const savedCommentThread = await commentThread.save();

    // Add the comment thread's ID to the original thread's children array
    originalThread.children.push(savedCommentThread._id);

    // Save the updated original thread to the database
    await originalThread.save();

    revalidatePath(path);
  } catch (err) {
    console.error("Error while adding comment:", err);
    throw new Error("Unable to add comment");
  }
}