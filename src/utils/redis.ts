import { redisConnection } from '../queues/connection.js';

// Extremely fast, atomic operation in Redis >>> using Set
export async function markVisited(url:string){
  const added=await redisConnection.sadd('crawler:visited_urls', url);
  return added===1;
}

export async function clearVisitedCache(){
  await redisConnection.del('crawler:visited_urls');
}
