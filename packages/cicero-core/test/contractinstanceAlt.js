/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const Template = require('../lib/template');
const ContractInstance = require('../src/contractinstanceAlt');
const stringify = require('json-stable-stringify');

const chai = require('chai');
const fs = require('fs');
const path = require('path');

chai.should();
chai.use(require('chai-things'));
chai.use(require('chai-as-promised'));

const newInstanceFromTemplatesWithData = async () => {
    const sampleTemplateArchive = fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.cta'));
    const template = await Template.fromArchive(sampleTemplateArchive);
    const sampleData = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.json'), "utf-8"));
    const sampleMetadata = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.metadata.json'), "utf-8"));
    const contractInstance = await new ContractInstance().fromTemplatesWithData([template], [sampleData]);
    contractInstance.setMetadata(sampleMetadata);

    return contractInstance;
}

describe('ContractInstance', () => {

    describe('#fromTemplatesWithData', () => {
        it('should be able to crate a contract instance form a template with data', async function () {

            const contractInstance = await newInstanceFromTemplatesWithData();

            const sampleContractInstance = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.instance.json'), "utf-8"));
            //console.log(`Output instance #fromTemplatesWithData: ${stringify(contractInstance.toJSON())}`);
            contractInstance.toJSON().should.eql(sampleContractInstance);
        });
    });

    describe('#fromTemplatesWithMarkdownCicero', () => {
        it('should be able to crate a contract instance form markdown cicero with templates', async function () {
            const sampleTemplateArchive = fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.cta'));
            const template = await Template.fromArchive(sampleTemplateArchive);
            const sampleData = fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.md'), "utf-8");
            const sampleMetadata = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.metadata.json'), "utf-8"));
            const contractInstance = await new ContractInstance().fromTemplatesWithMarkdownCicero([template], sampleData);
            contractInstance.setMetadata(sampleMetadata);

            const sampleContractInstance = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.instance.json'), "utf-8"));
            //console.log(`Output instance #fromTemplatesWithMarkdownCicero: ${stringify(contractInstance)}`);
            contractInstance.toJSON().should.eql(sampleContractInstance);
        });
    });

    describe('#fromArchive', () => {
        it('should be able to crate a contract instance form an archive', async function () {
            const sampleContractArchive = fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt', 'copyright-license.slc'));
            const contractInstance = await new ContractInstance().fromArchive(sampleContractArchive);

            const sampleContractInstance = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.instance.json'), "utf-8"));
            //console.log(`Output instance #fromArchive: ${stringify(contractInstance)}`);
            contractInstance.toJSON().should.eql(sampleContractInstance);
        });
    });

    describe('#toArchive', () => {
        it('should be able to create an archive from the contract instance', async function () {
            const contractInstanceToArchive = await newInstanceFromTemplatesWithData();

            const fileSlc = await contractInstanceToArchive.toArchive();
            fs.writeFileSync(path.resolve(__dirname, 'data/contractinstanceAlt', 'copyright-license.out.slc'), fileSlc);
        });
    });

    describe('#toMarkdownCicero', () => {
        it('should be able to create a markdown out of a contract instance, even generated from templates with data', async function () {
            const contractInstance = await newInstanceFromTemplatesWithData();

            // Had to create another copy of Markdown in Singapore Time zone
            const sampleData = fs.readFileSync(path.resolve(__dirname, 'data/contractinstanceAlt/templates', 'copyright-license@0.16.0.SGT.md'), "utf-8");

            //console.log(contractInstance.toMarkdownCicero());
            //console.log(sampleData);
            contractInstance.toMarkdownCicero().should.equal(sampleData);

        });
    });
});