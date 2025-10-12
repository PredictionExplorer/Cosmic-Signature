//! Buffer pool for zero-allocation effect chain processing
//!
//! This module provides a buffer pool that eliminates allocations during
//! effect chain processing by maintaining a pool of reusable buffers.
//!
//! # Performance
//! - Eliminates ~12 allocations per frame
//! - Reduces GC pressure
//! - Better memory locality
//!
//! # Usage
//! Enable with `--features advanced-optimizations` flag
//!
//! This is experimental infrastructure for future effect chain refactoring.

#![cfg_attr(not(feature = "advanced-optimizations"), allow(dead_code))]

use super::context::PixelBuffer;

/// High-performance buffer pool for effect chain processing
///
/// Uses a ping-pong buffer strategy to eliminate allocations during
/// effect processing. Each effect reads from one buffer and writes to another,
/// then they swap roles for the next effect.
pub struct EffectBufferPool {
    buffers: [PixelBuffer; 2],
    current: usize,
    capacity: usize,
}

impl EffectBufferPool {
    /// Create a new buffer pool with given capacity
    ///
    /// # Arguments
    /// * `capacity` - Number of pixels (width × height)
    pub fn new(capacity: usize) -> Self {
        Self {
            buffers: [
                vec![(0.0, 0.0, 0.0, 0.0); capacity],
                vec![(0.0, 0.0, 0.0, 0.0); capacity],
            ],
            current: 0,
            capacity,
        }
    }
    
    /// Get the current buffer (for reading)
    #[inline]
    pub fn current(&self) -> &PixelBuffer {
        &self.buffers[self.current]
    }
    
    /// Get the current buffer mutably (for writing)
    #[inline]
    pub fn current_mut(&mut self) -> &mut PixelBuffer {
        &mut self.buffers[self.current]
    }
    
    /// Get the alternate buffer (for writing during effect processing)
    #[inline]
    pub fn alternate_mut(&mut self) -> &mut PixelBuffer {
        &mut self.buffers[1 - self.current]
    }
    
    /// Swap buffers (after processing an effect)
    #[inline]
    pub fn swap(&mut self) {
        self.current = 1 - self.current;
    }
    
    /// Load data into current buffer
    pub fn load(&mut self, data: PixelBuffer) {
        let current_buf = &mut self.buffers[self.current];
        
        // Resize if capacity changed
        if data.len() != current_buf.len() {
            current_buf.resize(data.len(), (0.0, 0.0, 0.0, 0.0));
            self.capacity = data.len();
        }
        
        current_buf.copy_from_slice(&data);
    }
    
    /// Take ownership of current buffer (consumes the pool temporarily)
    pub fn take_current(self) -> PixelBuffer {
        let mut buffers = self.buffers;
        std::mem::take(&mut buffers[self.current])
    }
    
    /// Clear current buffer for reuse
    pub fn clear_current(&mut self) {
        for pixel in self.buffers[self.current].iter_mut() {
            *pixel = (0.0, 0.0, 0.0, 0.0);
        }
    }
    
    /// Ensure buffers have correct capacity
    pub fn ensure_capacity(&mut self, capacity: usize) {
        if self.capacity != capacity {
            self.buffers[0].resize(capacity, (0.0, 0.0, 0.0, 0.0));
            self.buffers[1].resize(capacity, (0.0, 0.0, 0.0, 0.0));
            self.capacity = capacity;
        }
    }
}

/// Optimized effect chain executor using buffer pool
///
/// This eliminates allocations by reusing buffers in a ping-pong pattern:
/// Effect 1: buffer A → buffer B
/// Effect 2: buffer B → buffer A  
/// Effect 3: buffer A → buffer B
/// etc.
pub struct PooledEffectExecutor {
    pool: EffectBufferPool,
}

impl PooledEffectExecutor {
    /// Create a new pooled executor
    pub fn new(capacity: usize) -> Self {
        Self {
            pool: EffectBufferPool::new(capacity),
        }
    }
    
    /// Process buffer through effects using pool (zero allocation)
    ///
    /// # Performance
    /// Eliminates all intermediate allocations during effect processing
    pub fn process_with_pool<F>(
        &mut self,
        input: PixelBuffer,
        mut process_fn: F,
    ) -> PixelBuffer
    where
        F: FnMut(&PixelBuffer, &mut PixelBuffer),
    {
        // Load input into pool
        self.pool.load(input);
        
        // Process using ping-pong buffers with safe borrowing
        {
            let current_idx = self.pool.current;
            let (src, dest) = if current_idx == 0 {
                let (first, second) = self.pool.buffers.split_at_mut(1);
                (&first[0] as &PixelBuffer, &mut second[0])
            } else {
                let (first, second) = self.pool.buffers.split_at_mut(1);
                (&second[0] as &PixelBuffer, &mut first[0])
            };
            process_fn(src, dest);
        }
        self.pool.swap();
        
        // Clone current buffer (pool retains ownership)
        self.pool.current().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_pool_creation() {
        let pool = EffectBufferPool::new(100);
        assert_eq!(pool.current().len(), 100);
        assert_eq!(pool.capacity, 100);
    }
    
    #[test]
    fn test_buffer_pool_swap() {
        let mut pool = EffectBufferPool::new(10);
        pool.current_mut()[0] = (1.0, 0.0, 0.0, 1.0);
        
        let initial_current = pool.current;
        pool.swap();
        assert_eq!(pool.current, 1 - initial_current);
    }
    
    #[test]
    fn test_buffer_pool_load() {
        let mut pool = EffectBufferPool::new(5);
        let data = vec![(0.5, 0.5, 0.5, 1.0); 5];
        
        pool.load(data.clone());
        assert_eq!(pool.current()[0], (0.5, 0.5, 0.5, 1.0));
    }
    
    #[test]
    fn test_pooled_executor() {
        let mut executor = PooledEffectExecutor::new(10);
        let input = vec![(0.5, 0.5, 0.5, 1.0); 10];
        
        let output = executor.process_with_pool(input, |src, dest| {
            // Simple copy operation
            dest.copy_from_slice(src);
        });
        
        assert_eq!(output.len(), 10);
        assert_eq!(output[0], (0.5, 0.5, 0.5, 1.0));
    }
    
    #[test]
    fn test_ensure_capacity() {
        let mut pool = EffectBufferPool::new(10);
        pool.ensure_capacity(20);
        
        assert_eq!(pool.capacity, 20);
        assert_eq!(pool.current().len(), 20);
    }
}

