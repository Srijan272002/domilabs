import * as tf from '@tensorflow/tfjs-node';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface TrainingData {
  inputs: number[][];
  outputs: number[][];
  validationSplit?: number;
}

export interface ModelConfig {
  modelName: string;
  version: string;
  inputShape: number[];
  outputShape: number[];
  learningRate?: number;
  epochs?: number;
  batchSize?: number;
}

export interface PredictionResult {
  prediction: number[];
  confidence: number;
  modelVersion: string;
  timestamp: Date;
}

export abstract class BaseModel {
  protected model: tf.LayersModel | null = null;
  protected config: ModelConfig;
  protected modelPath: string;
  protected isLoaded: boolean = false;

  constructor(config: ModelConfig) {
    this.config = config;
    this.modelPath = path.join(process.cwd(), 'models', 'saved', config.modelName);
  }

  abstract buildModel(): tf.LayersModel;
  abstract preprocessInput(data: any): number[];
  abstract postprocessOutput(prediction: tf.Tensor): number[];
  abstract generateTrainingData(sampleSize: number): Promise<TrainingData>;

  async initialize(): Promise<void> {
    try {
      // Try to load existing model
      if (await this.modelExists()) {
        await this.loadModel();
        logger.info('Model loaded successfully', {
          modelName: this.config.modelName,
          path: this.modelPath
        });
      } else {
        // Build and compile new model
        this.model = this.buildModel();
        // Always compile the model to ensure it's ready
        this.model.compile({
          optimizer: tf.train.adam(this.config.learningRate || 0.001),
          loss: 'meanSquaredError',
          metrics: ['mae']
        });
        logger.info('New model created and compiled', {
          modelName: this.config.modelName,
          version: this.config.version
        });
      }
      this.isLoaded = true;
    } catch (error) {
      logger.error('Failed to initialize model', {
        error: error instanceof Error ? error.message : 'Unknown error',
        modelName: this.config.modelName
      });
      throw error;
    }
  }

  protected ensureModelCompiled(): void {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    // Check if model is compiled by checking for optimizer
    if (!this.model.optimizer) {
      this.model.compile({
        optimizer: tf.train.adam(this.config.learningRate || 0.001),
        loss: 'meanSquaredError',
        metrics: ['mae']
      });
      logger.debug('Model recompiled', {
        modelName: this.config.modelName
      });
    }
  }

  async train(trainingData: TrainingData): Promise<tf.History> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    try {
      // Ensure model is compiled before training
      this.ensureModelCompiled();

      const { inputs, outputs, validationSplit = 0.2 } = trainingData;

      // Convert to tensors
      const xs = tf.tensor2d(inputs);
      const ys = tf.tensor2d(outputs);

      logger.info('Starting model training', {
        modelName: this.config.modelName,
        samplesCount: inputs.length,
        epochs: this.config.epochs || 100
      });

      // Train the model
      const history = await this.model.fit(xs, ys, {
        epochs: this.config.epochs || 100,
        batchSize: this.config.batchSize || 32,
        validationSplit,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              logger.info('Training progress', {
                modelName: this.config.modelName,
                epoch: epoch + 1,
                loss: logs?.loss,
                valLoss: logs?.val_loss
              });
            }
          }
        }
      });

      // Clean up tensors
      xs.dispose();
      ys.dispose();

      // Save the trained model
      await this.saveModel();

      logger.info('Model training completed', {
        modelName: this.config.modelName,
        finalLoss: history.history.loss[history.history.loss.length - 1],
        finalValLoss: history.history.val_loss[history.history.val_loss.length - 1]
      });

      return history;
    } catch (error) {
      logger.error('Model training failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        modelName: this.config.modelName
      });
      throw error;
    }
  }

  async predict(inputData: any): Promise<PredictionResult> {
    if (!this.model || !this.isLoaded) {
      throw new Error('Model not loaded');
    }

    try {
      const processedInput = this.preprocessInput(inputData);
      const inputTensor = tf.tensor2d([processedInput]);

      const prediction = this.model.predict(inputTensor) as tf.Tensor;
      const result = this.postprocessOutput(prediction);

      // Calculate confidence (simplified approach)
      const confidence = this.calculateConfidence(prediction);

      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();

      return {
        prediction: result,
        confidence,
        modelVersion: this.config.version,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Prediction failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        modelName: this.config.modelName
      });
      throw error;
    }
  }

  private calculateConfidence(prediction: tf.Tensor): number {
    // Simple confidence calculation - can be enhanced
    const values = prediction.dataSync();
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min;
    return Math.max(0, Math.min(1, 1 - (range / max)));
  }

  async saveModel(): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.modelPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await this.model.save(`file://${this.modelPath}`);
      
      // Save model metadata
      const metadata = {
        config: this.config,
        savedAt: new Date().toISOString(),
        tensorflowVersion: tf.version.tfjs
      };
      
      fs.writeFileSync(
        path.join(this.modelPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      logger.info('Model saved successfully', {
        modelName: this.config.modelName,
        path: this.modelPath
      });
    } catch (error) {
      logger.error('Failed to save model', {
        error: error instanceof Error ? error.message : 'Unknown error',
        modelName: this.config.modelName
      });
      throw error;
    }
  }

  async loadModel(): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
      
      // Always recompile the model after loading
      this.model.compile({
        optimizer: tf.train.adam(this.config.learningRate || 0.001),
        loss: 'meanSquaredError',
        metrics: ['mae']
      });
      
      logger.info('Model loaded and compiled successfully', {
        modelName: this.config.modelName,
        path: this.modelPath
      });
    } catch (error) {
      logger.error('Failed to load model', {
        error: error instanceof Error ? error.message : 'Unknown error',
        modelName: this.config.modelName
      });
      throw error;
    }
  }

  protected async modelExists(): Promise<boolean> {
    const modelJsonPath = path.join(this.modelPath, 'model.json');
    return fs.existsSync(modelJsonPath);
  }

  getModelInfo(): { config: ModelConfig; isLoaded: boolean; modelPath: string } {
    return {
      config: this.config,
      isLoaded: this.isLoaded,
      modelPath: this.modelPath
    };
  }

  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this.isLoaded = false;
    }
  }
} 